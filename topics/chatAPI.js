"use strict"

const Sequelize = require("sequelize")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")
const ChunkUpdate = require("../includes/models/topicUpdate")

const sequelize = require("../includes/dbConnector/sequelizeClient");

const Topic = require("../includes/topic")

const h = require("whispeerHelper")

const Bluebird = require("bluebird")

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
			}
		}]
	})
}

const getLaterChunks = (chunk) => {
	return Chunk.findAll({
		where: {
			id: {
				$gte: chunk.id
			},
			ChatId: chunk.ChatId
		}
	})
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

const chatResponse = (chat, userID) => {
	return Bluebird.coroutine(function* () {
		const latestMessage = yield chatLatestMessage(chat)
		const unreadMessageIDs = yield chatUnreadMessages(chat, userID)

		const laterChunks = yield getLaterChunks(latestMessage.chunk)

		const latestChunk = laterChunks.find((chunk) => chunk.latest)

		return {
			chat: Object.assign({
				latestMessageID: latestMessage.id,
				latestChunkID: latestChunk.id,
				unreadMessageIDs,
			}, chat.getAPIFormatted()),
			chunks: laterChunks.map((chunk) => chunk.getAPIFormatted()),
			messages: [latestMessage.getAPIFormatted()],
		}
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
		chatResponse(chat, request.session.getUserID())
	)
}

const chatAPI = {
	create: ({ initialChunk, firstMessage, receiverKeys }, fn, request) => {
		return Topic.validateBeforeCreate(request, initialChunk, receiverKeys).then(() => {
			return sequelize.transaction((transaction) => {
				const includeReceiverInCreate = {
					include: [{
						association: Chunk.Receiver,
					}],
					transaction
				}

				return Bluebird.all([
					Chat.create({}, { transaction }),
					Chunk.create({ receiverKeys, meta: initialChunk }, includeReceiverInCreate),
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
			return addToUnread(chunk, message.id, request).thenReturn({
				chat: chat.getAPIFormatted(),
				chunks: [chunk.getAPIFormatted()],
				messages: [message.getAPIFormatted()],
			})
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

	getLatestChunkUpdate: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const chunkUpdate = yield ChunkUpdate.findOne({
				where: {
					$and: [{ latest: true }, { ChatId: id }]
				}
			})

			return chunkUpdate.getAPIFormatted()
		}).nodeify(fn)
	},

	getChunkUpdates: ({ id, oldestKnownChunkUpdate, limit = 20 }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const tempSQL = sequelize.dialect.QueryGenerator.selectQuery(ChunkUpdate, {
				attributes: ["index"],
				where: {
					id: oldestKnownChunkUpdate,
					ChatId: id,
				}
			}).slice(0,-1)

			const chunkUpdates = yield ChunkUpdate.findAll({
				where: {
					$and: [{ ChatId: id }, { index: { $lt: sequelize.literal(`(${tempSQL})`) }}]
				},
				limit,
				order: ["index"]
			})

			return chunkUpdates.map((chunkUpdate) => chunkUpdate.getAPIFormatted())
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

			// TODO: (CH) return some chunks?

			const messages = yield sequelize.query(MESSAGE_QUERY, {
				type: sequelize.QueryTypes.SELECT,
				model: Message,
				bind: {
					id,
					userID: request.session.getUserID(),
					oldestID: oldestKnownMessage,
				},
			})

			return {
				messages: messages.map((message) => message.getAPIFormatted()),
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
		create: ({ predecessorID, chunkMeta, receiverKeys }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const validateChunkPromise = Topic.validateBeforeCreate(request, chunkMeta, receiverKeys)

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
						Chunk.create({ meta: chunkMeta, receiverKeys, ChatId: predecessor.ChatId, predecessorId: predecessor.id }, {
							include: [{
								association: Chunk.Receiver,
							}],
							transaction
						})
					])
				))[1]

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
							Message.update({ latest: false }, { where: { latest: true, ChunkId: chunkID }, transaction }),
							Message.create(dbMessageData, { transaction })
						])
					}))[1]

					yield addToUnread(chunk, dbMessage.id, request)

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
			}).nodeify(fn)
		}
	},

	chunkUpdate: {
		create: ({ chunkID, chunkUpdate }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findById(chunkID)

				yield chunk.validateAccess(request)

				if (!chunk.latest) {
					throw new SuccessorError("chunk already has a successor")
				}

				const dbChunkUpdate = (yield sequelize.transaction((transaction) => {
					return Bluebird.all([
						ChunkUpdate.update({ latest: false }, { where: { latest: true, ChunkId: chunkID }, transaction }),
						ChunkUpdate.create(chunkUpdate, { transaction })
					])
				}))[1]

				return dbChunkUpdate.getAPIFormatted()
			}).nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunkUpdate = yield ChunkUpdate.findById(id)

				yield chunkUpdate.validateAccess(request)

				return chunkUpdate.getAPIFormatted()
			}).nodeify(fn)
		}
	}
}

module.exports = chatAPI
