"use strict"

const Sequelize = require("sequelize")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")

const sequelize = require("../includes/dbConnector/sequelizeClient");

const Topic = require("../includes/topic")

const Bluebird = require("bluebird")

// TODO: access violations!

const chatAPI = {
	create: ({ initialChunk, firstMessage, receiverKeys }, fn, request) => {
		return Topic.validateBeforeCreate(request, initialChunk, receiverKeys).then(() => {
			return sequelize.transaction((transaction) => {
				return Bluebird.all([
					Chat.create({}, { transaction }),
					Chunk.create({ receiverKeys, meta: initialChunk }, { transaction }),
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
			console.log(chat, chunk, message)
		})
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
			chat.validateAccess(request)).map((chat) => chat.getAPIFormatted()
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
		}).map((chunkData) => chunkData.id).then((chunkIDs) => ({
			chunkIDs
		}))
		// all chunks where this is the chat
	},

	getMessages: ({ id, oldestKnownMessage, limit = 20 }) => {

	},

	getChatWithUser: ({ userID }) => {
		// where I am the receiver and the other user is the receiver (and no one else!)
	},

	chunk: {
		create: ({ predecessorId, chunkMeta, receiverKeys }, fn, request) => {
			// ensure we are admin/creator of predecessorId!
			// set receiver keys

			Topic.validateBeforeCreate(request, chunkMeta, receiverKeys)

			const notImplemented = true

			if (notImplemented) {
				throw new Error("Not yet implemented")
			}

			return Sequelize.transaction((transaction) =>
				Chunk.update({ latest: false }, { where: { latest: true, ChatId: predecessorId }, transaction }).then(() =>
					Chunk.create({ meta: chunkMeta, receiverKeys }, { transaction })
				)
			)
		},

		get: ({ id }) => {
			return Chunk.findById(id).then((chunk) => chunk.getAPIFormatted())
		},
	},

	message: {
		create: ({ chunkID, message }) => {
			// ensure chunk is the latest
			// ensure I am a receiver of chunk
			//
		},

		get: ({ id }) => {

		}
	},

	topicUpdate: {
		create: ({ chunkID, topicUpdate }) => {

		},

		get: ({ id }) => {

		}
	}
}

module.exports = chatAPI
