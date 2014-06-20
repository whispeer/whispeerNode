"use strict";

var step = require("step");
var h = require("whispeerHelper");


var Topic = require("../includes/topic");
var Message = require("../includes/messages");

/*

	topic: {
		createTime: (int)
		key: key,
		cryptKeys: [key],
		receiver: (int),
		creator: (int),
		newest (int),
		unread: (bool)
	}

	message: {
		unsignedMeta: {
			topicid: (int),
			read: (bool)
		},
		meta: {
			createTime: (int),
			topicHash: (hex)
			previousMessage: (int),
			previousMessageHash: (hex),
			ownHash: (hex)
			sender: (int)
		}
		content: {
			key,
			iv: (hex),
			text: (hex)
		}
		signature: (hex)
		encrSignature: (hex)
	}

*/

var t = {
	getTopic: function getTopicF(data, fn, view) {
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			topic.getFullData(view, this, true, false);
		}), h.sF(function (topicData) {
			this.ne({
				topic: topicData
			});
		}), fn);
	},
	getTopics: function getTopicsF(data, fn, view) {
		step(function () {
			Topic.own(view, data.afterTopic, 10, this);
		}, h.sF(function (topics) {
			var i;
			for (i = 0; i < topics.length; i += 1) {
				topics[i].getFullData(view, this.parallel(), true, false);
			}

			if (topics.length === 0) {
				this.ne([]);
			}
		}), h.sF(function (results) {
			this.ne({
				topics: results
			});
		}), fn);
	},
	getUserTopic: function (data, fn, view) {
		step(function () {
			Topic.getUserTopicID(view, data.userid, this);
		}, h.sF(function (topicid) {
			this.ne({
				topicid: topicid
			});
		}), fn);
	},
	markRead: function markReadF(data, fn, view) {
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			topic.markMessagesRead(view, data.beforeTime, this);
		}), h.sF(function (stillUnread) {
			this.ne({
				unread: stillUnread
			});
		}), fn);
	},
	getTopicMessages: function getMessagesF(data, fn, view) {
		var remainingCount;
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			var count = Math.min(data.maximum || 20, 20);

			topic.getMessages(view, data.afterMessage, count, this);
		}), h.sF(function (data) {
			remainingCount = data.remaining;
			var messages = data.messages;
			var i;
			for (i = 0; i < messages.length; i += 1) {
				messages[i].getFullData(view, this.parallel(), true);
			}

			this.parallel()();
		}), h.sF(function (data) {
			this.ne({
				remaining: remainingCount,
				messages: data
			});
		}), fn);
	},
	getUnreadCount: function getUnreadCountF(data, fn, view) {
		step(function () {
			Topic.unreadCount(view, this);
		}, h.sF(function (unread) {
			this.ne({unread: unread});
		}), fn);
	},
	send: function sendMessageF(data, fn, view) {
		step(function () {
			Message.create(view, data.message, this);
		}, h.sF(function () {
			this.ne({
				success: true
			});
		}), fn);
		//message
	},
	sendNewTopic: function sendNewTopicF(data, fn, view) {
		var topic;
		step(function () {
			Topic.create(view, data.topic, data.receiverKeys, this);
		}, h.sF(function (theTopic) {
			topic = theTopic;
			data.message.meta.topicid = theTopic.getID();
			Message.create(view, data.message, this);
		}), h.sF(function () {
			topic.getFullData(view, this, false, false);
		}), h.sF(function (data) {
			this.ne({
				topic: data,
				success: true
			});
		}), fn);
	}
};

module.exports = t;