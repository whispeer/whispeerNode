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

	var hasAccess = [];

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
		var uid;
		step(function hA1() {
			uid = view.getUserID();
			if (hasAccess.indexOf(uid) > -1) {
				this.last.ne(true);
			}

			client.sismember(domain + ":receiver", uid, this);
		}, h.sF(function hA2(member) {
			hasAccess.push(uid);
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
				this.parallel.unflatten();
				Key.getWData(view, data.key, this.parallel(), true);
				if (data.additionalKey) {
					Key.getWData(view, data.additionalKey, this.parallel(), true);
				}
			} else {
				this.ne(data.key);
			}
		}), h.sF(function (keyData, additionalKey) {
			result.key = keyData;

			if (additionalKey) {
				result.additionalKey = additionalKey;
			}

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
			this.ne(count !== 0);
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
		var unread = false;
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zremrangebyscore(domain + ":user:" + view.getUserID() + ":unread", "-inf", beforeTime, this);
		}), h.sF(function () {
			theTopic.isUnread(view, this);
		}), h.sF(function (isUnread) {
			unread = isUnread;
			if (!isUnread) {
				client.zrem("topic:user:" + view.getUserID() + ":unreadTopics", id, this.parallel());
			}

			this.parallel()();
		}), h.sF(function () {
			if (unread) {
				theTopic.getUnreadMessages(view, this);
			} else {
				this.ne([]);
			}
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
					multi.zadd("topic:user:" + receiver[i] + ":unreadTopics", time, id);
					multi.zadd(domain + ":user:" + receiver[i] + ":unread", time, messageID);
				}

				multi.zadd("topic:user:" + receiver[i] + ":topics", time, id);
			}

			multi.hmset(domain + ":data", {
				"newest": messageID,
				"time": time
			});

			multi.exec(this);
		}), h.sF(function () {
			var i;
			for (i = 0; i < theReceiver.length; i += 1) {
				client.publish("topic:user:" + theReceiver[i] + ":message", messageID, this);
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

	this.remainingCount = function remainingCountF(view, afterMessage, count, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zrank(mDomain, afterMessage, this);
		}), h.sF(function (index) {
			this.ne(Math.max(index - count, 0));
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
				result.push(new Message(messageids[i], theTopic));
			}

			this.ne(result);
		}), cb);
	};

	/** get topic data */
	this.getTData = function getTDataF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.hgetall(domain + ":data", this.parallel());
			client.hget(domain + ":receiverKeys", view.getUserID(), this.parallel());
		}), h.sF(function (data, key) {
			if (key) {
				data.additionalKey = key;
			}

			this.ne(data);
		}), cb);
	};
};

Topic.unreadCount = function (view, cb) {
	step(function () {
		client.zcard("topic:user:" + view.getUserID() + ":unreadTopics", this);
	}, cb);
};

Topic.unread = function (view, cb) {
	step(function () {
		client.zrevrange("topic:user:" + view.getUserID() + ":unreadTopics", 0, -1, this);
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
		client.zrank("topic:user:" + view.getUserID() + ":topics", afterTopic, this);
	}, h.sF(function (index) {
		if (index === null) {
			index = -1;
		}

		client.zrevrange("topic:user:" + view.getUserID() + ":topics", index + 1, index + count, this);
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

	//TODO: get receiver w/o sender
	//map keys to users
	//check user can read their crypto key

	var receiver, receiverWO = [], cryptKeys, result = {}, theTopicID;
	step(function () {
		var err = validator.validate("topic", data);

		if (err) {
			throw new InvalidTopicData();
		}

		if (Math.abs(data.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidTopicData();
		}

		receiver = data.receiver;

		var i;
		for (i = 0; i < receiver.length; i += 1) {
			User.getUser(receiver[i].identifier, this.parallel());
		}
	}, h.sF(function (recv) {
		var i;
		for (i = 0; i < receiver.length; i += 1) {
			receiver[i].id = recv[i].getID();
		}

		for (i = 0; i < receiver.length; i += 1) {
			if (receiver[i].key) {
				receiverWO.push(receiver[i]);
				SymKey.createWDecryptors(view, receiver[i].key, this.parallel());
			}
		}
	}), h.sF(function (keys) {
		cryptKeys = keys;
		var i;
		for (i = 0; i < receiverWO.length; i += 1) {
			receiverWO[i].key = cryptKeys[i].getRealID();
			cryptKeys[i].hasUserAccess(receiverWO[i].id, this.parallel());
		}
	}), h.sF(function (acc) {
		var i;
		for (i = 0; i < acc.length; i += 1) {
			if (!acc[i]) {
				//TODO: clean up/rollback
				throw new InvalidTopicData();
			}
		}

		SymKey.createWDecryptors(view, data.key, this);
	}), h.sF(function (key) {
		result.key = key.getRealID();

		//TO-DO: check all receiver have access!

		result.creator = view.getUserID();

		result.newest = 0;

		client.incr("topic:topics", this);
	}), h.sF(function (topicid) {
		theTopicID = topicid;
		result.topicid = topicid;

		var i;
		for (i = 0; i < receiver.length; i += 1) {
			client.zadd("topic:user:" + receiver[i].id + ":topics", new Date().getTime(), topicid, this.parallel());
			if (receiver[i].key) {
				client.hset("topic:" + topicid + ":receiverKeys", receiver[i].id, receiver[i].key, this.parallel());
			}
		}

		client.hmset("topic:" + topicid + ":data", result, this.parallel());
		client.sadd("topic:" + topicid + ":receiver", receiver.map(function (e) {return e.id;}), this.parallel());
	}), h.sF(function () {
		this.ne(new Topic(theTopicID));
	}), cb);
};

module.exports = Topic;