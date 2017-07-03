"use strict";

var step = require("step");
var h = require("whispeerHelper");


var Topic = require("../includes/topic");
var Message = require("../includes/messages");

const Chat = require("../includes/models/chat")
const Chunk = require("../includes/models/chatChunk")
const NewMessage = require("../includes/models/message")
const UserUnreadMessage = require("../includes/models/unreadMessage")

var Bluebird = require("bluebird");

var MAXMESSAGELENGTH = 200 * 1000;

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
	getTopic: function getTopicF({ topicid }, fn, request) {
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
	getTopics: function getTopicsF({ afterTopic }, fn, request) {
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
	refetch: function (data, fn) {
		return Bluebird.resolve({
			clearMessages: false,
			messages: []
		}).nodeify(fn)
	},
	getUserTopic: function (data, fn, request) {
		step(function () {
			Topic.getUserTopicID(request, data.userid, this);
		}, h.sF(function (topicid) {
			this.ne({
				topicid: topicid
			});
		}), fn);
	},
	markRead: function markReadF(data, fn, request) {
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			topic.markMessagesRead(request, data.beforeTime, this);
		}), h.sF(function (stillUnread) {
			this.ne({
				unread: stillUnread
			});
		}), fn);
	},
	getTopicMessages: function getMessagesF({ topicid, afterMessage }, fn, request) {
		// TODO check access

		return NewMessage.findAll({
			where: {
				ChunkId: topicid
			}
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

		/*step(function () {
			Topic.get(topicid, this);
		}, h.sF(function (_topic) {
			topic = _topic;
			var count = Math.min(maximum || 20, 20);

			topic.getMessages(request, afterMessage, count, this);
		}), h.sF(function (data) {
			remainingCount = data.remaining;
			var messages = data.messages;
			var i;
			for (i = 0; i < messages.length; i += 1) {
				messages[i].getFullData(request, this.parallel(), true);
			}

			this.parallel()();
		}), h.sF(function (messages) {
			return getTopicUpdates(request, topic, messages, afterMessage).then(function (topicUpdates) {
				return {
					topicUpdates: topicUpdates,
					remaining: remainingCount,
					messages: messages
				};
			});
		}), fn);*/
	},
	getUnreadTopicIDs: function (data, fn, request) {
		step(function () {
			Topic.unreadIDs(request, this);
		}, h.sF(function (unread) {
			this.ne({unread: unread});
		}), fn);
	},
	getUnreadCount: function getUnreadCountF(data, fn, request) {
		step(function () {
			Topic.unreadCount(request, this);
		}, h.sF(function (unread) {
			this.ne({unread: unread});
		}), fn);
	},
	getLatestTopicUpdate: function (data, fn, request) {
		step(function () {
			Topic.get(data.topicID, this);
		}, h.sF(function (topic) {
			return topic.getLatestTopicUpdate(request).then(function (topicUpdate) {
				return {
					topicUpdate: topicUpdate
				};
			});
		}), fn);
	},
	createTopicUpdate: function (data, fn, request) {
		step(function () {
			Topic.get(data.topicID, this);
		}, h.sF(function (topic) {
			topic.createTopicUpdate(request, data.topicUpdate, this);
		}), h.sF(function (id) {
			this.ne({
				id: id
			});
		}), fn);
	},
	send: function sendMessageF(data, fn, request) {
		step(function () {
			if (data.message.content.ct.length > MAXMESSAGELENGTH) {
				throw new Error("message to long");
			}

			Message.create(request, data.message, this);
		}, h.sF(function (result) {
			this.ne({
				success: result.success,
				server: result.server
			});
		}), fn);
		//message
	},
	sendNewTopic: function sendNewTopicF(data, fn, request) {
		var topic;
		step(function () {
			if (data.message.content.ct.length > MAXMESSAGELENGTH) {
				throw new Error("message to long");
			}

			Topic.create(request, data.topic, data.receiverKeys, this);
		}, h.sF(function (theTopic) {
			topic = theTopic;
			data.message.meta.topicid = theTopic.getID();
			Message.create(request, data.message, this);
		}), h.sF(function () {
			topic.getFullData(request, this, false, false);
		}), h.sF(function (data) {
			this.ne({
				topic: data,
				success: true
			});
		}), fn);
	}
};

module.exports = t;
