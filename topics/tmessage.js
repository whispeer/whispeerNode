"use strict";

var step = require("step");
var h = require("whispeerHelper");


var Topic = require("../includes/topic");
var Message = require("../includes/messages");

/*

	topic: {
		//thinking: we need multiple ones here right?
		key: key,
		receiver: (int),
		creator: (int),
		newest (int),
		unread: (bool)
	}

	message: {
		meta: {
			previousOwn: (int),
			previousOther: (int),
			sender: (int),
			signature: (hex),
			topicid: (int),
			read: (bool)
		}
		content: {
			key,
			iv: (hex),
			text: (hex),
			signature: (hex)
		}

	}

*/

var u = {
	getTopics: function getTopicsF(data, fn, view) {
		step(function () {
			Topic.own(view, data.afterTopic, 20, this);
		}, h.sF(function (topics) {
			var i;
			for (i = 0; i < topics.length; i += 1) {
				topics[i].getFullData(view, this, true, false);
			}
		}), h.sF(function (results) {
			this.ne(results);
		}), fn);
	},
	getTopicMessages: function getMessagesF(data, fn, view) {
		step(function () {
			
		}, h.sF(function (topic) {
			topic.getMessages(view, data.afterMessage, 20, this);
		}), h.sF(function (messages) {
			//TODO
		}), fn);
		//data.topic
		//data.loaded
		//data.topicData

		//data.count
		//data.after


		//return:
		//data.count
		//topic:
		//messages:
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
		}, h.sF(function (theMessage) {
			theMessage.getFullData(view, this);
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
		}), fn);
	}
};

module.exports = u;