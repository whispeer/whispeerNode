"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Topic = require("../includes/topic");
var Message = require("../includes/messages");

const Chunk = require("../includes/models/chatChunk")
const NewMessage = require("../includes/models/message")
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

const formatTopic = (chunk) => {
	const newest = chunk.message[0]

	return {
		latestTopicUpdates: [],
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
			// TODO: sort? after topic id?

			Chunk.findAll({
				where: { id: { $in: chunkIDs } },
				include: [{
					association: Chunk.Message,
					required: true,
					where: { latest: true }
				}]
			})
		).map((chunk) =>
			formatTopic(chunk)
		).then((topics) => ({ topics })).nodeify(fn)
	},
	refetch:  (data, fn) => {
		return Bluebird.resolve({
			clearMessages: false,
			messages: []
		}).nodeify(fn)
	},
	getTopicMessages: ({ topicid, afterMessage }, fn, request) => {
		// TODO remaining count, after message

		return Chunk.findById(topicid).then((chunk) => {
			return chunk.validateAccess(request).thenReturn(chunk)
		}).then((chunk) => {
			return NewMessage.findAll({
				where: {
					ChunkId: chunk.id
				}
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
	getLatestTopicUpdate: (data, fn) => {
		return Bluebird.resolve({}).nodeify(fn)
	},
	createTopicUpdate:  (data, fn) => {
		return Bluebird.reject(new Error("Topic Updates are not supported any more")).nodeify(fn)
	},
	getUserTopic:  (data, fn, request) => {
		step(function () {
			Topic.getUserTopicID(request, data.userid, this);
		}, h.sF(function (topicid) {
			this.ne({
				topicid: topicid
			});
		}), fn);
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

		/*var topic;
		step(function () {
			if (data.message.content.ct.length > MAXMESSAGELENGTH) {
				throw new Error("message to long");
			}

			Topic.create(request, topic, receiverKeys, this);
		}, h.sF(function (theTopic) {
			topic = theTopic;
			message.meta.topicid = theTopic.getID();
			Message.create(request, message, this);
		}), h.sF(function () {
			topic.getFullData(request, this, false, false);
		}), h.sF(function (data) {
			this.ne({
				topic: data,
				success: true
			});
		}), fn);*/
	}
};

module.exports = t;
