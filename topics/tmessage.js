"use strict";

const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
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

const formatTopic = (chunk) => {
	const newest = chunk.message[0]
	const latestTopicUpdate = formatTopicUpdate(chunk.chunkTitleUpdate[0])

	const latestTopicUpdates = latestTopicUpdate ? [latestTopicUpdate] : []

	return {
		latestTopicUpdates,
		meta: chunk.getMeta(),
		topicid: chunk.id,
		unread: [], // TODO
		newest: {
			content: newest.getContent(),
			meta: Object.assign({
				sender: newest.sender,
				sendTime: newest.sendTime,
				messageid: newest.id,
				topicid: chunk.id,
			}, newest.getMeta()),
		},
		newestTime: newest.sendTime
	}
}

var t = {
	getTopic: ({ topicid }, fn, request) => {
		return Chunk.findOne({
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
		}).then((chunk) => {
			return chunk.validateAccess(request).thenReturn(chunk)
		}).then((chunk) => {
			return { topic: formatTopic(chunk) }
		}).nodeify(fn)
	},
	getTopics: ({ afterTopic }, fn, request) => {
		return Chunk.findAll({
			attributes: ["id"],
			include: [{
				attributes: [],
				association: Chunk.Receiver,
				required: true,
				where: { userID: request.session.getUserID() }
			}]
		}).map((chunk) => chunk.id).then((chunkIDs) =>
			Chunk.findAll({
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
		).map((chunk) =>
			formatTopic(chunk)
		).then((topics) => {
			topics.sort((topic1, topic2) => parseInt(topic2.newest.meta.sendTime, 10) - parseInt(topic1.newest.meta.sendTime, 10))

			const afterIndex = topics.findIndex((topic) => topic.topicid === afterTopic)

			return afterIndex === -1 ? topics : topics.slice(afterIndex + 1, afterIndex + 21)
		}).then((topics) => ({ topics })).nodeify(fn)
	},
	refetch:  (data, fn) => {
		return Bluebird.resolve({
			clearMessages: false,
			messages: []
		}).nodeify(fn)
	},
	getTopicMessages: ({ topicid, afterMessage }, fn, request) => {
		// TODO remaining count

		const idClause = afterMessage ? {
			id: {
				$lt: afterMessage
			}
		} : {}

		return Chunk.findById(topicid).then((chunk) => {
			return chunk.validateAccess(request).thenReturn(chunk)
		}).then((chunk) => {
			return Message.findAll({
				where: Object.assign({
					ChunkId: chunk.id
				}, idClause),
				limit: 20
			})
		}).map((message) => {
			return {
				content: message.getContent(),
				meta: Object.assign({
					sender: message.sender,
					sendTime: message.sendTime,
					messageid: message.id,
					topicid: topicid,
				}, message.getMeta()),
			}
		}).then((messages) => ({ topicUpdates: [], messages, remaining: 0 })).nodeify(fn)
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
			return { unread: 0 }
		}).nodeify(fn)
	},
	send: (data, fn, request) => {

		const {
			topicid
		} = data.message.meta

		delete data.message.meta.sender
		delete data.message.meta.sendTime
		delete data.message.meta.topicid

		chatAPI.message.create({ chunkID: topicid, message: data.message}, fn, request)
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
