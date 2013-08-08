"use strict";

var step = require("step");
var h = require("whispeerHelper");


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
	get: function getMessagesF(data, fn, view) {
		step(function () {
			//
		});
	},
	getMessages: function getMessagesF(data, fn, view) {
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
	send: function sendMessageF(data, fn, view) {
		//message
	},
	sendNewTopic: function sendNewTopicF(data, fn, view) {
		//topic
		//message
	}
};

module.exports = u;