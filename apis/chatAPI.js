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
const KeyApi = require("../includes/crypto/KeyApi")
const SymKey = require("../includes/crypto/symKey")

const {
	pushNotify,
	updateBadge,
	synchronizeRead,
	validateChunk,
	getUnreadChatIDs,
} = require("../includes/chatHelper")

const MAXMESSAGELENGTH = 200 * 1000;

const MESSAGE_QUERY = `
	SELECT "Message".* FROM "Messages" AS "Message"
		INNER JOIN "Chunks" AS "chunk" ON "Message"."ChunkId" = "chunk"."id" AND "chunk"."ChatId" = $id
		INNER JOIN "Receivers" AS "chunk.receiver" ON "chunk"."id" = "chunk.receiver"."ChunkId" AND "chunk.receiver"."userID" = $userID
	WHERE ("Message"."id" < $oldestID) ORDER BY "Message"."id" DESC LIMIT $limit;
`

const MESSAGE_COUNT_QUERY = `
	SELECT COUNT("Message".id) FROM "Messages" AS "Message"
		INNER JOIN "Chunks" AS "chunk" ON "Message"."ChunkId" = "chunk"."id" AND "chunk"."ChatId" = $id
		INNER JOIN "Receivers" AS "chunk.receiver" ON "chunk"."id" = "chunk.receiver"."ChunkId" AND "chunk.receiver"."userID" = $userID
	WHERE ("Message"."id" < $oldestID);
`

const DELETE_RECEIVER_QUERY = `
	DELETE FROM "Receivers"
		WHERE "Receivers"."userID" = $userID
		AND "Receivers"."ChunkId" IN (SELECT id from "Chunks" WHERE "Chunks"."ChatId" = $chatID);
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

const CHAT_IDS_QUERY = `
SELECT "Chat"."id"
FROM "Chats" AS "Chat"
INNER JOIN "Chunks" AS "chunk" ON "Chat"."id" = "chunk"."ChatId"
	AND "chunk"."latest" = TRUE
INNER JOIN "Receivers" AS "chunk.receiver" ON "chunk"."id" = "chunk.receiver"."ChunkId"
	AND "chunk.receiver"."userID" = $userIDMe
INNER JOIN "Chunks" AS "chunk2" ON "Chat"."id" = "chunk2"."ChatId"
INNER JOIN "Messages" AS "chunk2.message" ON "chunk2"."id" = "chunk2.message"."ChunkId"
	AND "chunk2.message"."latest" = TRUE
ORDER BY "sendTime" DESC;
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

const getLaterChunks = (chunk, userID) => {
	return Chunk.findAll({
		where: {
			id: {
				$gte: chunk.id
			},
			ChatId: chunk.ChatId
		}, include: [{
			association: Chunk.ChunkTitleUpdate,
			as: "chunk",
			required: false,
			where: {
				latest: true
			}
		}]
	}).filter((chunk) =>
		Boolean(chunk.receiver.find((r) => r.userID === userID))
	)
}

const formatChatResponse = (chat, chunks, latestMessage, unreadMessageIDs) => {
	const latestMessageInfo = latestMessage ? { latestMessageID: latestMessage.messageUUID } : {}

	return {
		chat: Object.assign({
			latestChunkID: chunks.find((chunk) => chunk.latest).id,
			unreadMessageIDs,
		}, latestMessageInfo, chat.getAPIFormatted()),
		chunks: chunks.map((chunk) => chunk.getAPIFormatted()),
		messages: latestMessage ? [latestMessage.getAPIFormatted(chat.id)] : [],
	}
}

const chatResponse = (chat, request) => {
	return Bluebird.coroutine(function* () {
		const userID = request.session.getUserID()
		const latestMessage = chat.chunk[0].message[0]
		const messageChunk = chat.chunk[0]

		const unreadMessageIDs = chat.userUnreadMessage.map((m) => m.message.messageUUID)

		const chunks = messageChunk.latest ? [messageChunk] : yield getLaterChunks(messageChunk, userID)

		const hasLatestMessageAccess = Boolean(chunks.find((chunk) => chunk.id === messageChunk.id))

		yield Bluebird.all([
			hasLatestMessageAccess ? addMessageKeys([latestMessage], request) : null,
			addChunksKeys(chunks, request),
			latestMessage.loadPreviousMessage()
		])

		return formatChatResponse(
			chat,
			chunks,
			hasLatestMessageAccess ? latestMessage : null,
			unreadMessageIDs
		)
	})()
}

const getChats = (chatIDs, request) => {
	return Chat.findAll({
		where: {
			id: {
				$in: chatIDs
			}
		},
		include: [{
			association: Chat.UserUnreadMessage,
			required: false,
			where: {
				userID: request.session.getUserID()
			},
			include: [{
				association: UserUnreadMessage.Message,
				as: "unreadmessage"
			}],
		}, {
			association: Chat.Chunk,
			as: "chunk",
			required: false,
			include: [{
				association: Chunk.Message,
				as: "message",
				required: true,
				where: {
					latest: true
				}
			}, {
				association: Chunk.ChunkTitleUpdate,
				as: "chunk",
				required: false,
				where: {
					latest: true
				}
			}]
		}],
		order: [
			[
				Sequelize.col("chunk.message.sendTime"),
				"DESC"
			]
		]
	}).each((chat) => {
		return chat.validateAccess(request)
	}).map((chat) => {
		return chatResponse(chat, request)
	})
}

const notifyUsers = (request, receiverIDs, pushData) => {
	receiverIDs.forEach((userID) => {
		const user = new User(userID)
		user.notify("chat", pushData)
		user.notify("message", pushData)
	})

	return pushNotify(request, receiverIDs, pushData)
}

const addMessageKeys = (messages, request) => Bluebird.all(messages.map((message) => request.addKey(message.meta._key)))

const addChunksKeys = (chunks, request) => Bluebird.all(chunks.map((chunk) => {
	const meReceiver = chunk.receiver.find((receiver) => receiver.userID === request.session.getUserID())

	return Bluebird.all([
		request.addKey(chunk.meta._key),
		meReceiver.key ? request.addKey(meReceiver.key) : null
	])
}))

const createSymKeys = (request, keys) => {
	if (!Array.isArray(keys)) {
		return Bluebird.resolve()
	}

	return Bluebird.resolve(keys).map((key) => {
		return SymKey.create(request, key)
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
			message.previousMessage = null

			const chatResponseOthers = formatChatResponse(chat, [chunk], message, [])
			const chatResponseMe = formatChatResponse(chat, [chunk], message, [])
			const myID = request.session.getUserID()

			const otherReceiver = chunk.receiver.map((r) => r.userID).filter((userID) => userID !== myID)

			notifyUsers(request, otherReceiver, { chat: chatResponseOthers, message: message.getAPIFormatted(chat.id) })
			notifyUsers(request, [myID], { chat: chatResponseMe, message: message.getAPIFormatted(chat.id)  })

			return Bluebird.all([
				addToUnread(chunk, message.id, request),
				createSymKeys(request, firstMessage.imageKeys)
			]).thenReturn({ chat: chatResponseMe })
		}).nodeify(fn)
	},

	getUnreadIDs: (data, fn, request) => {
		return getUnreadChatIDs(request.session.getUserID()).then((chatIDs) => ({
			chatIDs
		})).nodeify(fn)
	},

	getAllIDs: (data, fn, request) => {
		return sequelize.query(CHAT_IDS_QUERY, {
			type: sequelize.QueryTypes.SELECT,
			bind: {
				userIDMe: request.session.getUserID(),
			},
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

			updateBadge(request.session.getUserID())
			synchronizeRead(request)
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

	getChunks: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const dbChunks = yield Chunk.findAll({ where: {
				ChatId: chat.id
			}})

			const chunks = dbChunks.filter((chunk) =>
				chunk.receiver.some((receiver) =>
					receiver.userID === request.session.getUserID()
				)
			).map((chunk) => chunk.getAPIFormatted() )

			return { chunks }
		})().nodeify(fn)
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
					limit
				},
			})

			const chunkIDs = messages.map((message) => message.ChunkId).filter((value, index, self) =>
				self.indexOf(value) === index
			)

			const max = Math.max.apply(Math, chunkIDs)
			const min = Math.min.apply(Math, chunkIDs)

			const chunks = yield Chunk.findAll({ where: {
				id: { $between: [min, max] },
				ChatId: chat.id
			}})

			yield Bluebird.all([
				addMessageKeys(messages, request),
				addChunksKeys(chunks, request),
				Message.loadPreviousMessage(messages),
			])

			return {
				messages: messages.map((message) => message.getAPIFormatted(chat.id)),
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
		create: ({ predecessorID, chunk: { meta, content }, receiverKeys, previousChunksDecryptors }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const predecessor = yield Chunk.findById(predecessorID)
				const chatID = predecessor.ChatId

				if (meta._key === predecessor.meta._key) {
					predecessor.receiver.forEach((r) => {
						receiverKeys[r.userID] = r.key
					})
				}

				yield Bluebird.all([
					predecessor.validateAccess(request),
					validateChunk(request, meta, receiverKeys),
				])

				if (!predecessor.isAdmin(request.session.getUserID())) {
					throw new AccessViolation(`Not an admin of chunk ${predecessor.id}: ${request.session.getUserID()}`)
				}

				if (!predecessor.latest) {
					throw new SuccessorError("Not the latest chunk")
				}

				const dbChunk = (yield sequelize.transaction((transaction) =>
					Bluebird.all([
						Chunk.update({ latest: false }, { where: { latest: true, ChatId: chatID }, transaction }),
						Chunk.create({ meta, content, receiverKeys, ChatId: chatID, predecessorId: predecessor.id }, {
							include: [{
								association: Chunk.Receiver,
							}],
							transaction
						})
					])
				))[1]

				const removedReceiver = predecessor.receiver.filter((receiver) =>
					!dbChunk.receiver.some(({ userID }) => receiver.userID === userID)
				).map(({ userID }) => userID)

				console.log(predecessor.receiver.map(({ userID }) => userID), dbChunk.receiver.map(({ userID }) => userID))

				if (removedReceiver.length > 0) {
					yield Bluebird.resolve(removedReceiver).map((userID) => Bluebird.all([
						sequelize.query(DELETE_RECEIVER_QUERY, { bind: { chatID, userID }}),
						UserUnreadMessage.delete({ where: { chatID, userID }})
					]))
				}

				if (previousChunksDecryptors) {
					const keys = yield KeyApi.getKeys(Object.keys(previousChunksDecryptors))
					const addedReceiver = dbChunk.receiver.filter((receiver) =>
						!predecessor.receiver.some(({ userID }) => receiver.userID === userID)
					)

					yield Bluebird.all(keys.map((key) => key.addDecryptors(request, previousChunksDecryptors)))

					const dbChunks = yield Chunk.findAll({ where: {
						ChatId: chatID
					}})

					const chunks = dbChunks.filter((chunk) =>
						chunk.receiver.some((receiver) =>
							receiver.userID === request.session.getUserID()
						)
					)

					const newReceiver = h.array.flatten(chunks.map((chunk) =>
						addedReceiver.map((receiver) => ({
							key: receiver.key,
							userID: receiver.userID,
							ChunkId: chunk.id
						}))
					))

					yield Chunk.ReceiverModel.bulkCreate(newReceiver)
				}

				notifyUsers(request, dbChunk.receiver.map(r => r.userID), { chunk: dbChunk.getAPIFormatted() })

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

				var err = validator.validate("message", message);

				if (err) {
					throw new InvalidMessageData();
				}

				if (!chunkID) {
					throw new InvalidMessageData();
				}

				const chunk = yield Chunk.findById(chunkID)

				yield chunk.validateAccess(request)

				if (!chunk.latest) {
					throw new SuccessorError("chunk already has a successor")
				}

				const latestMessage = yield Message.findOne({ where: {
					latest: true,
					ChunkId: chunkID
				}})

				if (latestMessage && h.parseDecimal(message.meta._sortCounter, 10) < h.parseDecimal(latestMessage.meta._sortCounter)) {
					return { success: false }
				}

				const dbMessageData = Object.assign({}, message, {
					sender: request.session.getUserID(),
					sendTime: new Date().getTime(),
					ChunkId: chunk.id
				})

				//TODO: check overall signature
				//chelper.checkSignature(user.key, toHash, meta.encrSignature)

				try {
					const dbMessage = (yield sequelize.transaction((transaction) => {
						return Bluebird.all([
							sequelize.query(UPDATE_LATEST_MESSAGES_QUERY, {
								bind: {
									ChatId: chunk.ChatId
								},
								transaction
							}),
							Message.update({
								latestInChunk: false
							}, {
								where: {
									latestInChunk: true,
									ChunkId: chunk.id
								},
								transaction
							}),
							Message.create(dbMessageData, { transaction })
						])
					}))[2]

					yield Bluebird.all([
						createSymKeys(request, message.imageKeys),
						dbMessage.loadPreviousMessage()
					])

					yield addToUnread(chunk, dbMessage.id, request)

					notifyUsers(request, chunk.receiver.map(r => r.userID), { message: dbMessage.getAPIFormatted(chunk.ChatId) })

					return Object.assign({ success: true }, dbMessage.getAPIFormatted(chunk.ChatId))
				} catch (err) {
					if (err instanceof Sequelize.UniqueConstraintError && err.fields.messageUUID && Object.keys(err.fields).length === 1) {
						const existingDBMessage = yield Message.findOne({ where: { messageUUID: err.fields.messageUUID }})

						yield existingDBMessage.loadPreviousMessage()

						if (existingDBMessage.sender !== request.session.getUserID()) {
							throw new Error("Duplicate UUID: Message already send but we are not the sender.")
						}

						return Object.assign({ success: true }, existingDBMessage.getAPIFormatted(chunk.ChatId))
					} else {
						return Bluebird.reject(err)
					}
				}
			})().nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const message = id.indexOf("-") === -1 ? yield Message.findById(id) : yield Message.findOne({ where: { messageUUID: id }})

				yield Bluebird.all([
					message.validateAccess(request),
					message.loadPreviousMessage()
				])

				return message.getAPIFormatted()
			})().nodeify(fn)
		}
	}
}

module.exports = chatAPI
