"use strict"

const Sequelize = require("sequelize")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")

const chatAPI = {
	create: ({ initialChunk, firstMessage }) => {
	},

	getUnreadIDs: (data, fn, request) => {
		return UserUnreadMessage.findAll({
			attributes: ["ChatId"],
			where: {
				userID: request.session.getUserID()
			},
			group: ["ChatId"]
		}).then(() => {

		}).nodeify(fn)
	},

	getAllIDs: (data, fn, request) => {
		debugger
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
		}).then((r) => {
			debugger
		})
	},

	get: ({ id }) => {
		return Chat.findById(id).then((chat) => chat.getAPIFormatted())
	},

	getMultiple: ({ ids }) => {

	},

	markRead: ({ id }) => {
		return Chat.findById(id).then((chat) => chat.markRead())
	},

	getChunkIDs: ({ id }) => {
		return Chat.findAll({
			where: {
				id
			},
			include: [{
				model: Chunk,
				attributes: ["id"]
			}]
		})
		// all chunks where this is the chat
	},

	getMessages: ({ id, oldestKnownMessage, limit = 20 }) => {

	},

	getChatWithUser: ({ userID }) => {
		// where I am the receiver and the other user is the receiver (and no one else!)
	},

	chunk: {
		create: ({ predecessor, chunkMeta, receiverKey }) => {

		},

		get: ({ id }) => {

		},
	},

	message: {
		create: ({ chunkID, message }) => {

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
