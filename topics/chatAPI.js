"use strict"

const Sequelize = require("sequelize")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")
const TopicUpdate = require("../includes/models/topicUpdate")

const sequelize = require("../includes/dbConnector/sequelizeClient");

const Topic = require("../includes/topic")

const Bluebird = require("bluebird")

// TODO: access violations!

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

const chatAPI = {
	create: ({ initialChunk, firstMessage, receiverKeys }, fn, request) => {
		return Topic.validateBeforeCreate(request, initialChunk, receiverKeys).then(() => {
			return sequelize.transaction((transaction) => {
				const includeReceiverInCreate = {
					include: [{
						association: Chunk.Receiver,
					}, {
						association: Chunk.AddedReceiver,
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
						message.setChat(chat, { transaction }),
					]).thenReturn([ chat, chunk, message ])
				})
			})
		}).then(([ chat, chunk, message ]) => {
			return addToUnread(chunk, message.id, request).thenReturn({
				chat: chat.getAPIFormatted(),
				chunk: chunk.getAPIFormatted(),
				message: message.getAPIFormatted(),
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
		}).map((entry) => entry.id).then((chatIDs) => ({
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

	get: ({ id, include: { latestChunk, latestMessage } = {} }, fn, request) => {
		return Chat.findById(id).then((chat) =>
			chat.validateAccess(request).thenReturn(chat)
		).then((chat) =>
			chat.getAPIFormatted()
		).nodeify(fn)
	},

	getMultiple: ({ ids }, fn, request) => {
		return Chat.findAll({
			where: {
				id: {
					$in: ids
				}
			}
		}).each((chat) =>
			chat.validateAccess(request)
		).map((chat) =>
			chat.getAPIFormatted()
		).nodeify(fn)
	},

	markRead: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)
			yield chat.validateAccess(request)
			yield UserUnreadMessage.delete({
				where: {
					ChatId: chat.id,
					userID: request.session.getUserID()
				}
			})
		}).nodeify(fn)
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

	getLatestTopicUpdate: ({ id }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const topicUpdate = yield TopicUpdate.findOne({
				where: {
					$and: [{ latest: true }, { ChatId: id }]
				}
			})

			return topicUpdate.getAPIFormatted()
		}).nodeify(fn)
	},

	getTopicUpdates: ({ id, oldestKnownTopicUpdate, limit = 20 }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const tempSQL = sequelize.dialect.QueryGenerator.selectQuery(TopicUpdate, {
				attributes: ["index"],
				where: {
					id: oldestKnownTopicUpdate,
					ChatId: id,
				}
			}).slice(0,-1)

			const topicUpdates = yield TopicUpdate.findAll({
				where: {
					$and: [{ ChatId: id }, { index: { $lt: sequelize.literal(`(${tempSQL})`) }}]
				},
				limit,
				order: ["index"]
			})

			return topicUpdates.map((topicUpdate) => topicUpdate.getAPIFormatted())
		}).nodeify(fn)
	},

	getMessages: ({ id, oldestKnownMessage, limit = 20 }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const include = [{
				association: Message.Chunk,
				model: Chunk.unscoped(),
				attributes: [],
				required: true,
				include: [{
					attributes: [],
					association: Chunk.UserWithAccess,
					required: true,
					where: { userID: request.session.getUserID() }
				}]
			}]

			const messages = yield Message.findAll({
				where: {
					$and: [{ ChatId: id }, { index: { $lt: oldestKnownMessage }}]
				},
				include,
				limit,
				order: ["id"]
			})

			const remainingMessagesCount = (yield Message.findAll({
				attributes: [[sequelize.fn("COUNT", sequelize.col("id")), "count"]],
				where: {
					$and: [{ ChatId: id }, { index: { $lt: messages[messages.length - 1].id }}]
				},
				include
			})).count

			return {
				messages: messages.map((message) => message.getAPIFormatted()),
				remainingMessagesCount
			}
		}).nodeify(fn)
	},

	getChatWithUser: ({ userID }, fn, request) => {
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
		}).nodeify(fn)
	},

	chunk: {
		create: ({ chunkMeta, receiverKeys }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const validateChunkPromise = Topic.validateBeforeCreate(request, chunkMeta, receiverKeys)

				const predecessor = yield Chunk.findById(chunkMeta.predecessorId)
				yield validateChunkPromise

				yield predecessor.validateAccess(request)



				if (!predecessor.isAdmin(request.session.getUserID())) {
					throw new AccessViolation(`Not an admin of chunk ${predecessor.id}: ${request.session.getUserID()}`)
				}

				yield Sequelize.transaction((transaction) =>
					Bluebird.all([
						Chunk.update({ latest: false }, { where: { latest: true, ChatId: chunkMeta.predecessorId }, transaction }),
						Chunk.create({ meta: chunkMeta, receiverKeys }, { transaction })
					])
				)
			}).nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findById(id)

				yield chunk.validateAccess(request)

				return chunk.getAPIFormatted()
			}).nodeify(fn)
		},
	},

	message: {
		create: ({ chunkID, message }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findById(chunkID)

				yield chunk.validateAccess()

				if (!chunk.latest) {
					throw new SuccessorError("chunk already has a successor")
				}

				const dbMessage = yield Message.create(Object.assign({}, message, {
					sender: request.session.getUserID(),
					sendTime: new Date().getTime(),
					ChatId: chunk.ChatId,
					ChunkId: chunk.id
				}))

				yield addToUnread(chunk, message.id, request)

				return dbMessage.getAPIFormatted()
			}).nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const message = yield Message.findById(id)

				yield message.validateAccess(request)

				return message.getAPIFormatted()
			}).nodeify(fn)
		}
	},

	topicUpdate: {
		create: ({ chunkID, topicUpdate }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const chunk = yield Chunk.findById(chunkID)

				yield chunk.validateAccess(request)

				if (!chunk.latest) {
					throw new SuccessorError("chunk already has a successor")
				}

				const dbTopicUpdate = yield sequelize.transaction((transaction) => {
					return Bluebird.all([
						TopicUpdate.update({ latest: false }, { where: { latest: true, ChunkId: chunkID }, transaction }),
						TopicUpdate.create(topicUpdate, { transaction })
					])
				})

				return dbTopicUpdate.getAPIFormatted()
			}).nodeify(fn)
		},

		get: ({ id }, fn, request) => {
			return Bluebird.coroutine(function* () {
				const topicUpdate = yield TopicUpdate.findById(id)

				yield topicUpdate.validateAccess(request)

				return topicUpdate.getAPIFormatted()
			}).nodeify(fn)
		}
	}
}

module.exports = chatAPI
