"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

//maximum difference: 5 minutes.
var MAXTIME = 5 * 60 * 1000;

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

*/

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	var mDomain = domain + ":messages";
	this.getID = function getIDF() {
		return id;
	};

	/** throw an error if the current user can not access this topic */
	function hasAccessError(view, cb) {
		step(function hAE1() {
			theTopic.hasAccess(view, this);
		}, h.sF(function hAE2(access) {
			if (access !== true) {
				throw new AccessViolation();
			}

			this.ne();
		}), cb);
	}

	/** has the current user access? */
	this.hasAccess = function hasAccessF(view, cb) {
		step(function hA1() {
			client.sismember(domain + ":receiver", view.getUserID(), this);
		}, h.sF(function hA2(member) {
			this.ne(member === 1);
		}), cb);
	};

	/** get receiver ids */
	this.getReceiverIDs = function getReceiverIDsF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.smembers(domain + ":receiver", this);
		}), cb);
	};

	/** get receiver objects */
	this.getReceiver = function getReceiverF(view, cb) {
		step(function () {
			theTopic.getReceiverIDs(view, this);
		}, h.sF(function(receivers) {
			var User = require("./user");

			var i;
			for (i = 0; i < receivers.length; i += 1) {
				User.get(receivers[i], this.parallel());
			}
		}), cb);
	};

	/** get receiver user data */
	this.getReceiverData = function getReceiverDataF(view, cb) {
		step(function () {
			theTopic.getReceiver(view, this);
		}, h.sF(function (receivers) {
			var i;
			for (i = 0; i < receivers; i += 1) {
				receivers[i].getUData(view, this);
			}
		}), cb);
	};

	/** get topic key */
	this.getKey = function getKeyF(view, cb) {
		var Key = require("./crypto/Key");
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hget(domain + ":data", "key", this);
		}), h.sF(function (realid) {
			Key.get(realid, this);
		}), cb);
	};

	/** get topic full data */
	this.getFullData = function getFullDataF(view, cb, key, receivers) {
		var Key = require("./crypto/Key");
		var result;
		step(function () {
			theTopic.getTData(view, this);
		}, h.sF(function (data) {
			result = data;
			if (key) {
				Key.getWData(view, data.key, this, true);
			} else {
				this.ne(data.key);
			}
		}), h.sF(function (keyData) {
			result.key = keyData;

			if (receivers) {
				theTopic.getReceiverData(view, this);
			} else {
				theTopic.getReceiverIDs(view, this);
			}
		}), h.sF(function (receiver) {
			result.receiver = receiver;

			theTopic.getUnreadMessages(view, this);
		}), h.sF(function (unreadMessages) {
			result.unread = unreadMessages;

			if (result.newest !== 0) {
				var Message = require("./messages");
				var newest = new Message(result.newest);
				newest.getFullData(view, this, true);
			}
		}), h.sF(function (newest) {
			result.newest = newest;

			this.ne(result);
		}), cb);
	};

	/** how many messages in this topic? */
	this.ownCount = function ownCountF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zcard(domain + ":user:" + view.getUserID() + ":messages", this);
		}), cb);
	};

	/** how many messages in this topic? */
	this.messageCount = function messageCountF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zcard(mDomain, this);
		}), cb);
	};

	/** is this topic empty? */
	this.isEmpty = function isEmptyF(view, cb) {
		step(function () {
			theTopic.messageCount(this);
		}, h.sF(function (messageCount) {
			this.ne(messageCount === 0);
		}), cb);
	};

	/** is this topic unread? */
	this.isUnread = function isUnreadF(view, cb) {
		step(function () {
			client.zcard(domain + ":user:" + view.getUserID() + ":unread", this);
		}, h.sF(function (count) {
			return count !== 0;
		}), cb);
	};

	/** get unread messages ids */
	this.getUnreadMessages = function getUnreadMessagesF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zrevrange(domain + ":user:" + view.getUserID() + ":unread", 0, -1, this);
		}), h.sF(function (res) {
			res.map(function (ele) {
				return parseInt(ele, 10);
			});

			this.ne(res);
		}), cb);
	};

	/** mark certain messages read */
	this.markMessagesRead = function markRead(view, beforeTime, cb) {
		var marked = false;
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zremrangebyscore(domain + ":user:" + view.getUserID() + ":unread", "-inf", beforeTime);
		}), h.sF(function () {
			theTopic.isUnread(view, this);
		}), h.sF(function (isUnread) {
			marked = isUnread;
			if (!isUnread) {
				client.zrem("user:" + view.getUserID() + ":unreadTopics", id, this.parallel());
			}

			this.parallel()();
		}), h.sF(function () {
			this.ne(marked);
		}), cb);
	};

	/** add a message to this topic */
	this.addMessage = function addMessageF(view, message, cb) {
		var theReceiver, theSender, messageID;
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			//TO-DO check that all receiver have access to the messageKey
			this.parallel.unflatten();

			message.getSenderID(view, this.parallel());
			message.getTime(view, this.parallel());
			theTopic.getReceiverIDs(view, this.parallel());
		}), h.sF(function (senderid, time, receiver) {
			theReceiver = receiver;
			theSender = senderid;
			var multi = client.multi();
			messageID = message.getID();

			multi.zadd(mDomain, time, messageID);
			multi.zadd(domain + ":user:" + senderid + ":messages", time, messageID);

			var i;
			for (i = 0; i < receiver.length; i += 1) {
				if (receiver[i] !== theSender) {
					multi.zadd("user:" + receiver[i] + ":unreadTopics", time, id);
				}

				multi.zadd("user:" + receiver[i] + ":topics", time, id);
			}

			multi.hmset(domain + ":data", {
				"newest": messageID,
				"time": time
			});

			multi.exec(this);
		}), h.sF(function () {
			var i;
			for (i = 0; i < theReceiver.length; i += 1) {
				if (theReceiver[i] !== theSender) {
					client.publish("user:" + theReceiver[i] + ":message", messageID, this);
				}
			}

			this.ne(message);
		}), cb);
	};

	/** get the newest message
	* @param view view
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getNewest = function getNewestF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zrevrange(mDomain, 0, 0, this);
		}), h.sF(function (messageids) {
			if (messageids.length === 1) {
				var Message = require("./messages");
				this.ne(new Message(messageids[0]));
			} else {
				this.ne(0);
			}
		}), cb);
	};

	/** get the messages after a certain message
	* @param view view
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getMessages = function getMessagesF(view, afterMessage, count, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zrevrank(mDomain, afterMessage, this);
		}), h.sF(function (index) {
			if (index === null) {
				index = -1;
			}

			client.zrevrange(mDomain, index + 1, index + count, this);
		}), h.sF(function (messageids) {
			var Message = require("./messages");
			var result = [], i;
			for (i = 0; i < messageids.length; i += 1) {
				result.push(new Message(messageids[i]));
			}

			this.ne(result);
		}), cb);
	};

	/** get topic data */
	this.getTData = function getTDataF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hgetall(domain + ":data", this);
		}), cb);
	};
};

Topic.unreadCount = function (view, cb) {
	step(function () {
		client.zcard("user:" + view.getUserID() + ":unreadTopics", this);
	}, cb);
};

Topic.unread = function (view, cb) {
	step(function () {
		client.zrevrange("user:" + view.getUserID() + ":unreadTopics", 0, -1, this);
	}, h.sF(function (unread) {
		var result = [], i;
		for (i = 0; i < unread.length; i += 1) {
			result.push(new Topic(unread[i]));
		}

		this.ne(result);
	}), cb);
};

Topic.own = function (view, afterTopic, count, cb) {
	step(function () {
		client.zrank("user:" + view.getUserID() + ":topics", afterTopic, this);
	}, h.sF(function (index) {
		if (index === null) {
			index = -1;
		}

		client.zrevrange("user:" + view.getUserID() + ":topics", index + 1, index + count, this);
	}), h.sF(function (topicids) {
		var result = [], i;
		for (i = 0; i < topicids.length; i += 1) {
			result.push(new Topic(topicids[i]));
		}

		this.ne(result);
	}), cb);
};

Topic.get = function (topicid, cb) {
	step(function () {
		client.exists("topic:" + topicid + ":data", this);
	}, h.sF(function (exists) {
		if (exists === 1) {
			this.ne(new Topic(topicid));
		} else {
			throw new TopicNotExisting();
		}
	}), cb);
};

Topic.create = function (view, data, cb) {
	var SymKey = require("./crypto/symKey");
	var User = require("./user.js");

	var receiver, result = {}, theTopicID;
	step(function () {
		var err = validator.validate("topic", data);

		if (err) {
			throw new InvalidTopicData();
		}

		if (Math.abs(data.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidTopicData();
		}

		if (data.cryptKeys.length !== data.receiver.length - 1) {
			throw new InvalidTopicData();
		}

		var i;
		for (i = 0; i < data.receiver.length; i += 1) {
			User.getUser(data.receiver[i], this.parallel());
		}
	}, h.sF(function () {
		var i;
		for (i = 0; i < data.cryptKeys.length; i += 1) {
			SymKey.createWDecryptors(view, data.cryptKeys[i], this.parallel());
		}
	}), h.sF(function () {
		SymKey.createWDecryptors(view, data.key, this);
	}), h.sF(function (key) {
		result.key = key.getRealID();
		receiver = data.receiver;

		//TO-DO: check all receiver have access!

		result.creator = view.getUserID();

		result.newest = 0;

		client.incr("topic:topics", this);
	}), h.sF(function (topicid) {
		theTopicID = topicid;
		result.topicid = topicid;

		var i;
		for (i = 0; i < receiver.length; i += 1) {
			client.zadd("user:" + receiver[i] + ":topics", new Date().getTime(), topicid, this.parallel());
		}

		client.hmset("topic:" + topicid + ":data", result, this.parallel());
		client.sadd("topic:" + topicid + ":receiver", receiver, this.parallel());
	}), h.sF(function () {
		this.ne(new Topic(theTopicID));
	}), cb);
};

module.exports = Topic;