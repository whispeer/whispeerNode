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
		meta: {
			createTime: (int),
			topicHash: (hex)
			previousMessage: (int),
			previousMessageHash: (hex),
			ownHash: (hex)
			sender: (int),
			topicid: (int),
			read: (bool)
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
	getTopics: function getTopicsF(data, fn, view) {
		step(function () {
			Topic.own(view, data.afterTopic, 20, this);
		}, h.sF(function (topics) {
			var i;
			for (i = 0; i < topics.length; i += 1) {
				topics[i].getFullData(view, this.parallel(), true, false);
			}

			this.parallel()();
		}), h.sF(function (results) {
			if (!results) {
				this.ne([]);
			} else {
				this.ne(results);
			}
		}), h.sF(function (results) {
			this.ne({
				topics: results
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

			this.parallel.unflatten();
			topic.getMessages(view, data.afterMessage, count, this.parallel());
			topic.remainingCount(view, data.afterMessage, count, this.parallel());
		}), h.sF(function (messages, remaining) {
			remainingCount = remaining;
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
			this.ne({});
		}), fn);
		//message
	},
	sendNewTopic: function sendNewTopicF(data, fn, view) {
		var topic;
		step(function () {
			Topic.create(view, data.topic, this);
		}, h.sF(function (theTopic) {
			topic = theTopic;
			data.message.meta.topicid = theTopic.getID();
			Message.create(view, data.message, this);
		}), h.sF(function () {
			topic.getFullData(view, this, false, false);
		}), h.sF(function (data) {
			this.ne({
				topic: data
			});
		}), fn);
	}
};

module.exports = t;