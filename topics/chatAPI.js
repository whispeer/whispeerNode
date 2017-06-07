"use strict"

const Sequelize = require("sequelize")

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")

// TODO: access violations!

const chatAPI = {
	create: ({ initialChunk, firstMessage }) => {
		// Topic.validateBeforeCreate(request, chunkMeta, receiverKeys)
		// create a new chat first
		// create the initial chunk next
		// create the first message after that? (or in a transaction with the chunk?)
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

	get: ({ id }) => {
		return Chat.findById(id).then((chat) => chat.getAPIFormatted())
	},

	getMultiple: ({ ids }) => {
		return Chat.findAll({
			where: {
				id: {
					$in: ids
				}
			}
		}).map((chat) => chat.getAPIFormatted())
	},

	markRead: ({ id }) => {
		return Chat.findById(id).then((chat) => chat.markRead())
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
				Chunk.update({ latest: false }, { where: { latest: true, ChatId: predecessorId }}).then(() =>
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
