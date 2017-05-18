"use strict";

var step = require("step");
var h = require("whispeerHelper");


var Topic = require("../includes/topic");
var Message = require("../includes/messages");

var Bluebird = require("bluebird");

var MAXMESSAGELENGTH = 200 * 1000;

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

const getTopicUpdates = (request, topic, messages, lastMessage) => {
	if (!messages || messages.length === 0) {
		return Bluebird.resolve([]);
	}

	return Bluebird.try(() => {
		messages.sort((m1, m2) => {
			return m1.meta.sendTime - m2.meta.sendTime;
		});

		return topic.getTopicUpdatesBetween(request,
			h.array.first(messages).meta.messageid,
			lastMessage
		);
	});
};

const getRemainingCount = (counts, remaining) => {
	return counts.reduce((prev, next) => prev + next.remainingCount, remaining)
}

const getPredecessorMessages = (request, topic, remaining, count) => {
	return topic.getPredecessor(request).then((predecessorTopic) => {
		if (count <= 0 || !predecessorTopic) {
			return topic.getPredecessorsMessageCounts(request).then((counts) => {
				return {
					remaining: getRemainingCount(counts, remaining),
					messages: [],
					topicUpdates: [],
				}
			})
		}

		return getTopicMessagesAndUpdates(request, predecessorTopic, count, 0)
	})
}

const getTopicMessagesAndUpdates = (request, topic, count, afterMessage) => {
	let remaining = 0

	return topic.getMessages(request, afterMessage, count).then(({ remaining: _remaining, messages }) => {
		remaining = _remaining;

		return messages
	}).filter((message) => {
		return message.hasAccess(request)
	}).map((message) => {
		return Bluebird.fromCallback(function(cb) {
			return message.getFullData(request, cb, true)
		})
	}).then((messages) => {
		const newCount = remaining > 0 ? 0 : count - messages.length

		return Bluebird.all([
			getTopicUpdates(request, topic, messages, afterMessage),
			getPredecessorMessages(request, topic, remaining, newCount)
		]).then(function ([topicUpdates, predecessor]) {
			const {
				remaining,
				messages: predecessorMessages,
				topicUpdates: predecessorTopicUpdates,
			} = predecessor

			return {
				topicUpdates: predecessorTopicUpdates.concat(topicUpdates),
				remaining,
				messages: predecessorMessages.concat(messages),
			}
		});
	})
}

const createHiddenMessage = (request, topic, message, name, cb) => {
	message.meta.topicid = topic.getID()

	Message.create(request, message, cb);
}

var t = {
	topic: {
		createSuccessor: function (data, fn, request) {
			let successorTopic, topic

			step(function () {
				Topic.get(data.topicID, this)
			}, h.sF(function (_topic) {
				topic = _topic
				topic.setSuccessor(request, data.successor, data.receiverKeys, this)
			}), h.sF(function (_successorTopic) {
				successorTopic = _successorTopic

				// createHiddenMessage(request, topic, data.oldChatMessage, "oldChat", this.parallel());
				// createHiddenMessage(request, successorTopic, data.newChatMessage, "newChat", this.parallel());

				this.ne()
			}), h.sF(function () {
				successorTopic.getFullData(request, this, false, false);
			}), h.sF(function (successorTopic) {
				return {
					successorTopic
				}
			}), fn)
		},
		successor: function (data, fn, request) {
			step(function () {
				Topic.get(data.topicID, this)
			}, h.sF(function (topic) {
				topic.getSuccessor(request, this)
			}), fn);
		}
	},
	getTopic: function getTopicF(data, fn, request) {
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			topic.getFullData(request, this, true, false);
		}), h.sF(function (topicData) {
			this.ne({
				topic: topicData
			});
		}), fn);
	},
	getTopics: function getTopicsF(data, fn, request) {
		step(function () {
			Topic.own(request, data.afterTopic, 10, data.noPredecessors, this);
		}, h.sF(function (topics) {
			var i;
			for (i = 0; i < topics.length; i += 1) {
				topics[i].getFullData(request, this.parallel(), true, false);
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
	refetch: function (data, fn, request) {
		step(function () {
			Topic.get(data.topicid, this);
		}, h.sF(function (topic) {
			topic.refetch(request, data, this);
		}), fn);
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
	getTopicMessages: function (data, fn, request) {
		var count = Math.min(data.maximum || 20, 20);

		return Topic.get(data.topicid).then(function (topic) {
			return getTopicMessagesAndUpdates(request, topic, count, data.afterMessage)
		}).nodeify(fn)
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
