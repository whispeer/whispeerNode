"use strict"

const Sequelize = require("sequelize")
const validator = require("whispeerValidations");
const h = require("whispeerHelper")
const Bluebird = require("bluebird")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")

const sequelize = require("../includes/dbConnector/sequelizeClient");

const User = require("../includes/user")
const KeyApi = require("../includes/crypto/KeyApi");


const MAXMESSAGELENGTH = 200 * 1000;
//maximum difference: 5 minutes.
const MAXTIME = 60 * 60 * 1000;

const MESSAGE_QUERY = `
	SELECT "Message".* FROM "Messages" AS "Message"
		INNER JOIN "Chunks" AS "chunk" ON "Message"."ChunkId" = "chunk"."id" AND "chunk"."ChatId" = $id
		INNER JOIN "Receivers" AS "chunk.receiver" ON "chunk"."id" = "chunk.receiver"."ChunkId" AND "chunk.receiver"."userID" = $userID
	WHERE ("Message"."id" < $oldestID) ORDER BY "Message"."id" DESC LIMIT 20;
`

const MESSAGE_COUNT_QUERY = `
	SELECT COUNT("Message".id) FROM "Messages" AS "Message"
		INNER JOIN "Chunks" AS "chunk" ON "Message"."ChunkId" = "chunk"."id" AND "chunk"."ChatId" = $id
		INNER JOIN "Receivers" AS "chunk.receiver" ON "chunk"."id" = "chunk.receiver"."ChunkId" AND "chunk.receiver"."userID" = $userID
	WHERE ("Message"."id" < $oldestID);
`

const CHAT_WITH_USER_QUERY = `
	SELECT "Chat"."id" FROM "Chats" AS "Chat"
		INNER JOIN "Chunks" AS "chunk"
			ON "Chat"."id" = "chunk"."ChatId"
			AND "chunk"."latest" = TRUE
		INNER JOIN "Receivers" AS "chunk.receiver1"
			ON "chunk"."id" = "chunk.receiver1"."ChunkId"
			AND "chunk.receiver1"."userID" = $userIDMe
		INNER JOIN "Receivers" AS "chunk.receiver2"
			ON "chunk"."id" = "chunk.receiver2"."ChunkId"
			AND "chunk.receiver2"."userID" = $userIDOther
		LEFT OUTER JOIN "Receivers" AS "chunk.receiver3"
			ON "chunk"."id" = "chunk.receiver3"."ChunkId"
			AND "chunk.receiver3"."userID" NOT IN ($userIDMe, $userIDOther)
	WHERE "chunk.receiver3"."id" IS null;
`

const UPDATE_LATEST_MESSAGES_QUERY = `
	UPDATE "Messages"
	SET "latest" = false
	FROM "Chunks"
	WHERE
		"Chunks"."ChatId" = $ChatId AND
		"Messages"."latest" = true AND
		"Messages"."ChunkId" = "Chunks"."id"
`

const addToUnread = (chunk, messageId, request) => {
	return Bluebird.all(chunk.receiver.map((receiver) => {
		if(request.session.isMyID(receiver.userID)) {
			return
		}

		return UserUnreadMessage.create({
			userID: receiver.userID,
			MessageId: messageId,
			ChatId: chunk.ChatId
		})
	}))
}

const chatLatestMessage = (chat) => {
	return Message.findOne({
		where: {
			latest: true
		},
		include: [{
			association: Message.Chunk,
			model: Chunk.unscoped(),
			required: true,
			where: {
				ChatId: chat.id
			},
		}]
	})
}

const getLaterChunks = (chunk, userID) => {
	return Chunk.findAll({
		where: {
			id: {
				$gte: chunk.id
			},
			ChatId: chunk.ChatId
		}
	}).filter((chunk) =>
		Boolean(chunk.receiver.find((r) => r.userID === userID))
	)
}

const chatUnreadMessages = (chat, userID) => {
	return UserUnreadMessage.findAll({
		attributes: ["MessageId"],
		where: {
			ChatId: chat.id,
			userID,
		}
	}).map((unreadMessage) =>
		unreadMessage.MessageId
	)
}

const formatChatResponse = (chat, chunks, unreadMessageIDs, latestMessage) => {
	const latestMessageInfo = latestMessage ? { latestMessageID: latestMessage.id } : {}

	return {
		chat: Object.assign({
			latestChunkID: chunks.find((chunk) => chunk.latest).id,
			unreadMessageIDs,
		}, latestMessageInfo, chat.getAPIFormatted()),
		chunks: chunks.map((chunk) => chunk.getAPIFormatted()),
		messages: latestMessage ? [latestMessage.getAPIFormatted()] : [],
	}
}

const chatResponse = (chat, request) => {
	return Bluebird.coroutine(function* () {
		const userID = request.session.getUserID()

		const latestMessage = yield chatLatestMessage(chat)

		const unreadMessageIDs = yield chatUnreadMessages(chat, userID)

		const chunks = yield getLaterChunks(latestMessage.chunk, userID)

		const hasLatestMessageAccess = Boolean(chunks.find((chunk) => chunk.id === latestMessage.chunk.id))

		if (hasLatestMessageAccess) {
			yield addMessageKeys([latestMessage], request)
		}

		yield addChunksKeys(chunks, request)

		return formatChatResponse(
			chat,
			chunks,
			unreadMessageIDs,
			hasLatestMessageAccess ? latestMessage : null
		)
	})()
}

const getChats = (chatIDs, request) => {
	return Chat.findAll({
		where: {
			id: {
				$in: chatIDs
			}
		}
	}).each((chat) =>
		chat.validateAccess(request)
	).map((chat) =>
		chatResponse(chat, request)
	)
}

const pushToUsers = (user, pushData) => {
	user.forEach((userID) => {
		new User(userID).notify("chat", pushData)
	})
}

const addMessageKeys = (messages, request) => Bluebird.all(messages.map((message) => request.addKey(message.meta._key)))

const addChunksKeys = (chunks, request) => Bluebird.all(chunks.map((chunk) => {
	const meReceiver = chunk.receiver.find((receiver) => receiver.userID === request.session.getUserID())

	if (meReceiver.key) {
		return request.addKey(meReceiver.key)
	}
}))

const ensureUserKeyAccess = (uid, key) => {
	return KeyApi.get(key).then(function (key) {
		return key.hasUserAccess(uid);
	}).then((access) => {
		if (!access) {
			throw new Error(`keys might not be accessible by all user ${key} - ${uid}`);
		}
	})
}

const validateChunk = (request, chunkMeta, receiverKeys) => {
	const receiverIDs = chunkMeta.receiver;
	const receiverWO = receiverIDs.filter(h.not(request.session.isMyID));

	return Bluebird.try(function () {
		var err = validator.validate("topicCreate", chunkMeta);

		if (err) {
			throw new InvalidChunkData();
		}

		if (!request.session.isMyID(chunkMeta.creator)) {
			throw new InvalidChunkData("session changed? invalid creator!");
		}

		if (Math.abs(chunkMeta.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidChunkData("max time exceeded!");
		}

		return User.checkUserIDs(receiverIDs);
	}).then(function () {
		return Bluebird.resolve(receiverWO).map(function (uid) {
			return Bluebird.all([
				ensureUserKeyAccess(uid, chunkMeta._key),
				ensureUserKeyAccess(uid, receiverKeys[uid]),
			])
		});
	})
}

const chatAPI = {
	create: ({ initialChunk, firstMessage, receiverKeys }, fn, request) => {
		return validateChunk(request, initialChunk.meta, receiverKeys).then(() => {
			return sequelize.transaction((transaction) => {
				const includeReceiverInCreate = {
					include: [{
						association: Chunk.Receiver,
					}],
					transaction
				}

				return Bluebird.all([
					Chat.create({}, { transaction }),
					Chunk.create({ receiverKeys, meta: initialChunk.meta, content: initialChunk.content }, includeReceiverInCreate),
					Message.create(Object.assign({}, firstMessage, {
						sender: request.session.getUserID(),
						sendTime: new Date().getTime(),
					}), { transaction }),
				]).then(([ chat, chunk, message ]) => {
					return Bluebird.all([
						chunk.setChat(chat, { transaction }),
						message.setChunk(chunk, { transaction }),
					]).thenReturn([ chat, chunk, message ])
				})
			})
		}).then(([ chat, chunk, message ]) => {
			// TODO (CH) fix unread message ids
			const chatResponse = formatChatResponse(chat, [chunk], [message.id], message)

			pushToUsers(chunk.receiver.map((r) => r.userID), chatResponse)
			return addToUnread(chunk, message.id, request).thenReturn({ chat: chatResponse })
		}).nodeify(fn)
	},

	getUnreadIDs: (data, fn, request) => {
		return UserUnreadMessage.findAll({
			attributes: ["ChatId"],
			where: {
				userID: request.session.getUserID()
			},
			group: ["ChatId"]
		}).map((entry) => entry.ChatId).then((chatIDs) => ({
			chatIDs
		})).nodeify(fn)
	},

	getAllIDs: (data, fn, request) => {
		return Chat.findAll({
			attributes: ["id"],
			include: [{
				association: Chat.Chunk,
				model: Chunk.unscoped(),
				attributes: [],
				where: {
					latest: true
				},
				required: true,
				include: [{
					attributes: [],
					association: Chunk.Receiver,
					required: true,
					where: { userID: request.session.getUserID() }
				}]
			}]
		}).map((entry) => entry.id).then((chatIDs) => ({
			chatIDs
		})).nodeify(fn)
	},

	get: ({ id }, fn, request) => {
		return getChats([id], request).then((chats) =>
			chats[0]
		).then((chat) =>
			({ chat })
		).nodeify(fn)
	},

	getMultiple: ({ ids }, fn, request) => {
		return getChats(ids, request).then((chats) =>
			({ chats })
		).nodeify(fn)
	},

	markRead: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)
			yield chat.validateAccess(request)
			yield UserUnreadMessage.destroy({
				where: {
					ChatId: chat.id,
					userID: request.session.getUserID()
				}
			})
		})().nodeify(fn)
	},

	getChunkIDs: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chunks = yield Chunk.findAll({
				attributes: ["id"],
				where: {
					ChatId: id
				}
			})

			yield Bluebird.all(chunks.map((chunk) => chunk.validateAccess(request)))

			return { chunkIDs: chunks.map((chunk) => chunk.id) }
		}).nodeify(fn)
	},

	getLatestChunk: ({ chatID }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chunk = yield Chunk.findAll({
				where: {
					ChatId: chatID,
					latest: true,
				}
			})

			yield chunk.validateAccess(request)

			return chunk.getAPIFormatted()
		}).nodeify(fn)
	},

	getMessages: ({ id, oldestKnownMessage, limit = 20 }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const messagesCountResponse = yield sequelize.query(MESSAGE_COUNT_QUERY, {
				bind: {
					id,
					userID: request.session.getUserID(),
					oldestID: oldestKnownMessage,
				},
			})

			const messagesCount = h.parseDecimal(messagesCountResponse[0][0].count)

			if (messagesCount === 0) {
				return {
					messages: [],
					remainingMessagesCount: 0
				}
			}

			const messages = yield sequelize.query(MESSAGE_QUERY, {
				type: sequelize.QueryTypes.SELECT,
				model: Message,
				bind: {
					id,
					userID: request.session.getUserID(),
					oldestID: oldestKnownMessage,
				},
			})

			const chunkIDs = messages.map((message) => message.ChunkId).filter((value, index, self) =>
				self.indexOf(value) === index
			)

			const chunks = yield Chunk.findAll({ where: { id: { $in: chunkIDs }}})

			yield addMessageKeys(messages, request)
			yield addChunksKeys(chunks, request)

			return {
				messages: messages.map((message) => message.getAPIFormatted()),
				chunks: chunks.map((chunk) => chunk.getAPIFormatted()),
				remainingMessagesCount: messagesCount - messages.length
			}
		})().nodeify(fn)
	},

	getChatWithUser: ({ userID }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chats = yield sequelize.query(CHAT_WITH_USER_QUERY, {
				type: sequelize.QueryTypes.SELECT,
				model: Chat,
				bind: {
					userIDMe: request.session.getUserID(),
					userIDOther: userID,
				},
			})

			if (chats.length === 0) {
				return {}
			}

			return {
				chatID: chats[0].id
			}
		})().nodeify(fn)

		/*
			This code does not work due to a bug with sequelize
			See: https://github.com/sequelize/sequelize/issues/7754
			return Chat.findAll({
				attributes: ["id"],
				where: ["\"chunk.receiver3\".\"id\" IS null"],
				include: [{
					association: Chat.Chunk,
					model: Chunk.unscoped(),
					attributes: [],
					where: {
						latest: true
					},
					required: true,
					include: [{
						attributes: [],
						association: Chunk.Receiver,
						required: true,
						where: { userID: request.session.getUserID() }
					}, {
						attributes: [],
						association: Chunk.Receiver,
						required: true,
						where: { userID }
					}, {
						attributes: [],
						association: Chunk.Receiver,
						where: {
							userID: {
								$notIn: [userID, request.session.getUserID()]
							}
						}
					}]
				}]
			})
		*/
	},

	chunk: {
		create: ({ predecessorID, chunk: { meta, content }, receiverKeys }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const validateChunkPromise = validateChunk(request, meta, receiverKeys)

				const predecessor = yield Chunk.findById(predecessorID)
				yield validateChunkPromise

				yield predecessor.validateAccess(request)

				if (!predecessor.isAdmin(request.session.getUserID())) {
					throw new AccessViolation(`Not an admin of chunk ${predecessor.id}: ${request.session.getUserID()}`)
				}

				if (!predecessor.latest) {
					throw new SuccessorError("Not the latest chunk")
				}

				const dbChunk = (yield sequelize.transaction((transaction) =>
					Bluebird.all([
						Chunk.update({ latest: false }, { where: { latest: true, ChatId: predecessor.ChatId }, transaction }),
						Chunk.create({ meta, content, receiverKeys, ChatId: predecessor.ChatId, predecessorId: predecessor.id }, {
							include: [{
								association: Chunk.Receiver,
							}],
							transaction
						})
					])
				))[1]

				pushToUsers(dbChunk.receiver.map(r => r.userID), { chunk: dbChunk.getAPIFormatted() })

				return {
					chunk: dbChunk.getAPIFormatted()
				}
			})().nodeify(fn)
		},

		successor: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findOne({
					where: {
						predecessorId: id
					}
				})

				if (!chunk) {
					return {}
				}

				yield chunk.validateAccess(request)

				return { chunk: chunk.getAPIFormatted() }
			})().nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findById(id)

				yield chunk.validateAccess(request)

				return chunk.getAPIFormatted()
			})().nodeify(fn)
		},
	},

	message: {
		create: ({ chunkID, message }, fn, request) => {
			return Bluebird.coroutine(function* () {
				if (message.content.ct.length > MAXMESSAGELENGTH) {
					throw new Error("message to long");
				}

				const chunk = yield Chunk.findById(chunkID)

				yield chunk.validateAccess(request)

				if (!chunk.latest) {
					throw new SuccessorError("chunk already has a successor")
				}

				const dbMessageData = Object.assign({}, message, {
					sender: request.session.getUserID(),
					sendTime: new Date().getTime(),
					ChunkId: chunk.id
				})

				try {
					const dbMessage = (yield sequelize.transaction((transaction) => {
						return Bluebird.all([
							sequelize.query(UPDATE_LATEST_MESSAGES_QUERY, {
								bind: {
									ChatId: chunk.ChatId
								},
								transaction
							}),
							Message.create(dbMessageData, { transaction })
						])
					}))[1]

					yield addToUnread(chunk, dbMessage.id, request)

					pushToUsers(chunk.receiver.map(r => r.userID), { message: dbMessage.getAPIFormatted() })

					return Object.assign({ success: true }, dbMessage.getAPIFormatted())
				} catch (err) {
					if (err instanceof Sequelize.UniqueConstraintError && err.fields.messageUUID && Object.keys(err.fields).length === 1) {
						const existingDBMessage = yield Message.findOne({ where: { messageUUID: err.fields.messageUUID }})

						return Object.assign({ success: true }, existingDBMessage.getAPIFormatted())
					} else {
						return Bluebird.reject(err)
					}
				}
			})().nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const message = yield Message.findById(id)

				yield message.validateAccess(request)

				return message.getAPIFormatted()
			})().nodeify(fn)
		}
	}
}

module.exports = chatAPI
