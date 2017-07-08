"use strict";

const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")
const ChunkTitleUpdate = require("../includes/models/chunkTitleUpdate")

const chatAPI = require("./chatAPI")

const sequelize = require("../includes/dbConnector/sequelizeClient");

var Bluebird = require("bluebird");

const UNREAD_TOPICS_QUERY = `
	SELECT DISTINCT "Messages"."ChunkId" from "Messages"
	INNER JOIN "UserUnreadMessages" ON
		"Messages"."id" = "UserUnreadMessages"."MessageId" AND
		"UserUnreadMessages"."userID" = $userID
`

const DELETE_UNREAD_MESSAGES_QUERY = `
	DELETE FROM "UserUnreadMessages" USING "Messages"
	WHERE
		"Messages"."id" = "UserUnreadMessages"."MessageId" AND
		"UserUnreadMessages"."userID" = $userID AND
		"Messages"."ChunkId" = $chunkID
`

const TOPIC_WITH_USER_QUERY = `
	SELECT "Chunks"."id" FROM "Chunks"
		INNER JOIN "Receivers" AS "receiverMe"
			ON "Chunks"."id" = "receiverMe"."ChunkId"
			AND "receiverMe"."userID" = $userIDMe
		INNER JOIN "Receivers" AS "receiverOther"
			ON "Chunks"."id" = "receiverOther"."ChunkId"
			AND "receiverOther"."userID" = $userIDOther
		LEFT OUTER JOIN "Receivers" AS "receiverNone"
			ON "Chunks"."id" = "receiverNone"."ChunkId"
			AND "receiverNone"."userID" NOT IN ($userIDMe, $userIDOther)
	WHERE "receiverNone"."id" IS null AND "Chunks"."latest" = true;
`

const formatTopicUpdate = (chunkTitleUpdate) => {
	if (!chunkTitleUpdate) {
		return
	}

	const apiFormatted = chunkTitleUpdate.getAPIFormatted()

	return {
		id: apiFormatted.server.id,
		meta: apiFormatted.meta,
		content: apiFormatted.content,
	}
}

const formatMessage = (message, topicid) => {
	return {
		content: message.getContent(),
		meta: Object.assign({
			sender: message.sender,
			sendTime: message.sendTime,
			messageid: message.id,
			topicid,
		}, message.getMeta()),
	}
}

const formatTopic = (chunk, unread = []) => {
	const newest = chunk.message[0]
	const latestTopicUpdate = formatTopicUpdate(chunk.chunkTitleUpdate[0])

	const latestTopicUpdates = latestTopicUpdate ? [latestTopicUpdate] : []

	return {
		latestTopicUpdates,
		meta: chunk.getMeta(),
		topicid: chunk.id,
		unread,
		newest: formatMessage(newest, chunk.id),
		newestTime: newest.sendTime
	}
}

const getUserUnreadMessagesByChunk = (userID) => {
	return UserUnreadMessage.findAll({
		where: {
			userID
		},
		include: [{
			attributes: ["id", "ChunkId"],
			association: UserUnreadMessage.Message
		}]
	}).then((unreadMessages) => {
		return unreadMessages.map((unreadMessage) =>
			unreadMessage.message
		)
	}).then((unreadMessages) => {
		const byChunk = {}

		unreadMessages.forEach((message) => {
			if (typeof byChunk[message.ChunkId] === "undefined") {
				byChunk[message.ChunkId] = []
			}

			byChunk[message.ChunkId].push(message.id)
		})

		return byChunk
	})

}

var t = {
	getTopic: ({ topicid }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chunk = yield Chunk.findOne({
				where: { id: topicid },
				include: [{
					association: Chunk.Message,
					required: true,
					where: { latest: true }
				}, {
					association: Chunk.ChunkTitleUpdate,
					required: false,
					where: { latest: true }
				}]
			})

			if (!chunk) {
				throw new Error(`could not find topic ${topicid}`)
			}

			yield chunk.validateAccess(request)

			const byChunkUnread = yield getUserUnreadMessagesByChunk(request.session.getUserID())

			return { topic: formatTopic(chunk, byChunkUnread[chunk.id]) }
		})().nodeify(fn)
	},
	getTopics: ({ afterTopic }, fn, request) => {
		return Bluebird.coroutine(function* () {

		const chunkIDs = (yield Chunk.findAll({
				attributes: ["id"],
				include: [{
					attributes: [],
					association: Chunk.Receiver,
					required: true,
					where: { userID: request.session.getUserID() }
				}]
			})).map((chunk) => chunk.id)

			const chunks = yield Chunk.findAll({
				where: { id: { $in: chunkIDs } },
				include: [{
					association: Chunk.Message,
					required: true,
					where: { latest: true }
				}, {
					association: Chunk.ChunkTitleUpdate,
					required: false,
					where: { latest: true }
				}]
			})

			const byChunkUnread = yield getUserUnreadMessagesByChunk(request.session.getUserID())

			const topics = chunks.map((chunk) => formatTopic(chunk, byChunkUnread[chunk.id]))

			topics.sort((topic1, topic2) => parseInt(topic2.newest.meta.sendTime, 10) - parseInt(topic1.newest.meta.sendTime, 10))

			const afterIndex = topics.findIndex((topic) => topic.topicid === afterTopic)

			const paginatedTopics = afterIndex === -1 ? topics.slice(0, 20) : topics.slice(afterIndex + 1, afterIndex + 21)

			return { topics: paginatedTopics }
		})().nodeify(fn)
	},
	refetch:  (data, fn) => {
		return Bluebird.resolve({
			clearMessages: false,
			messages: []
		}).nodeify(fn)
	},
	getTopicMessages: ({ topicid, afterMessage }, fn, request) => {
		const idClause = afterMessage ? {
			id: {
				$lt: afterMessage
			}
		} : {}

		return Bluebird.coroutine(function* () {
			const chunk = yield Chunk.findById(topicid)

			yield chunk.validateAccess(request)

			const messageCount = yield Message.count({
				where: Object.assign({
					ChunkId: chunk.id
				}, idClause)
			})

			if (messageCount === 0) {
				return { topicUpdates: [], messages: [], remaining: 0 }
			}

			const messages = yield Message.findAll({
				where: Object.assign({
					ChunkId: chunk.id
				}, idClause),
				order: [["id", "DESC"]],
				limit: 20,
			})

			const apiMessages = messages.map((message) =>
				formatMessage(message, topicid)
			)

			return { topicUpdates: [], messages: apiMessages, remaining: messageCount - apiMessages.length }
		})().nodeify(fn)
	},
	getLatestTopicUpdate: ({ topicID }, fn, request) => {
		return Chunk.findById(topicID).then((chunk) => {
			return chunk.validateAccess(request).thenReturn(chunk)
		}).then((chunk) => {
			return ChunkTitleUpdate.findOne({
				where: {
					latest: true,
					ChunkId: chunk.id,
				}
			})
		}).then((chunkTitleUpdate) => {
			if (!chunkTitleUpdate) {
				return {}
			}

			return {
				topicUpdate: formatTopicUpdate(chunkTitleUpdate)
			}
		}).nodeify(fn)
	},
	createTopicUpdate:  ({ topicID, topicUpdate }, fn, request) => {
		return Chunk.findById(topicID).then((chunk) => {
			return chunk.validateAccess(request).thenReturn(chunk)
		}).then((chunk) => {
			if (!chunk.latest) {
				throw new SuccessorError("Chunk has a successor")
			}

			return ChunkTitleUpdate.create({
				ChunkId: chunk.id,
				meta: topicUpdate.meta,
				content: topicUpdate.content,
			})
		}).then((chunkTitleUpdate) => {
			const apiFormatted = chunkTitleUpdate.getAPIFormatted()

			return {
				id: apiFormatted.server.id
			}
		}).nodeify(fn)
	},
	getUserTopic:  ({ userid }, fn, request) => {
		return Bluebird.coroutine(function* () {
			const chunks = yield sequelize.query(TOPIC_WITH_USER_QUERY, {
				type: sequelize.QueryTypes.SELECT,
				model: Chunk,
				bind: {
					userIDMe: request.session.getUserID(),
					userIDOther: parseInt(userid, 10),
				},
			})

			if (chunks.length === 0) {
				return {}
			}

			return {
				topicid: chunks[0].id
			}
		})().nodeify(fn)
	},
	getUnreadTopicIDs:  (data, fn, request) => {
		return sequelize.query(UNREAD_TOPICS_QUERY, {
			type: sequelize.QueryTypes.SELECT,
			bind: {
				userID: request.session.getUserID()
			},
		}).map((chunk) => chunk.ChunkId).then((unread) => {
			return { unread }
		}).nodeify(fn)
	},
	getUnreadCount: (data, fn, request) => {
		return t.getUnreadTopicIDs(data, null, request).then((unread) => ({
			unread: unread.length
		}))
	},
	markRead: ({ topicid }, fn, request) => {
		return sequelize.query(DELETE_UNREAD_MESSAGES_QUERY, {
			bind: {
				chunkID: topicid,
				userID: request.session.getUserID()
			},
		}).then(() => {
			return { unread: [] }
		}).nodeify(fn)
	},
	send: (data, fn, request) => {

		const {
			topicid
		} = data.message.meta

		delete data.message.meta.sender
		delete data.message.meta.sendTime
		delete data.message.meta.topicid

		return chatAPI.message.create({ chunkID: topicid, message: data.message}, null, request).then(({ success, server }) => {
			return {
				success,
				server: {
					messageid: server.id,
					topicid: server.chunkID,
					sendTime: server.sendTime,
					sender: server.sender,
				}
			}
		}).nodeify(fn)
	},
	sendNewTopic: ({ topic, receiverKeys, message }, fn, request) => {
		return chatAPI.create({
			initialChunk: { meta: topic },
			firstMessage: message,
			receiverKeys
		}, null, request).then(({ chat }) => {
			const topicid = chat.chunks[0].server.id

			return t.getTopic({ topicid }, null, request)
		}).then(({ topic }) => {
			return {
				topic,
				success: true
			}
		}).nodeify(fn)
	}
};

module.exports = t;
