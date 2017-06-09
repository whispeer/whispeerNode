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
			return {
				chat: chat.getAPIFormatted(),
				chunk: chunk.getAPIFormatted(),
				message: message.getAPIFormatted(),
			}
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

	get: ({ id }, fn, request) => {
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
		return Chat.findById(id).then((chat) =>
			chat.validateAccess(request).thenReturn(chat)
		).then((chat) =>
			chat.markRead()
		).nodeify(fn)
	},

	getChunkIDs: ({ id }, fn, request) => {
		return Chunk.findAll({
			attributes: ["id"],
			where: {
				ChatId: id
			}
		}).each((chunk) =>
			chunk.validateAccess(request).thenReturn(chunk)
		).map((chunkData) => chunkData.id).then((chunkIDs) => ({
			chunkIDs
		}))
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

	getLatestTopicUpdate: ({ chatID }, fn, request) => {

	},

	getMessages: ({ id, oldestKnownMessage, limit = 20 }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chat = yield Chat.findById(id)

			yield chat.validateAccess(request)

			const { messages, remainingMessagesCount } = yield chat.getMessages(oldestKnownMessage, limit)

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
		})
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
			})
		},

		get: ({ id }) => {
			return Chunk.findById(id).then((chunk) => chunk.getAPIFormatted())
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

				return dbMessage.getAPIFormatted()
			})
		},

		get: ({ id }) => {
			return Bluebird.coroutine(function* () {
				const message = yield Message.findById(id)

				yield message.validateAccess()

				return message.getAPIFormatted()
			})
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

				const dbTopicUpdate = TopicUpdate.create(topicUpdate)

				return dbTopicUpdate.getAPIFormatted()
			})
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
