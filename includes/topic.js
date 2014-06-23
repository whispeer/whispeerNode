"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var KeyApi = require("./crypto/KeyApi");

var mailer = require("./mailer");

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
			uid = view.session.getUserID();
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
				User.getUser(receivers[i], this.parallel());
			}
		}), cb);
	};

	/** get receiver user data */
	this.getReceiverData = function getReceiverDataF(view, cb) {
		step(function () {
			theTopic.getReceiver(view, this);
		}, h.sF(function (receivers) {
			var i;
			for (i = 0; i < receivers.length; i += 1) {
				receivers[i].getUData(view, this.parallel());
			}
		}), cb);
	};

	/** get topic key */
	this.getKey = function getKeyF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hget(domain + ":data", "key", this);
		}), h.sF(function (realid) {
			KeyApi.get(realid, this);
		}), cb);
	};

	/** get topic full data */
	this.getFullData = function getFullDataF(view, cb, key, receivers) {
		var result;
		step(function () {
			theTopic.getTData(view, this);
		}, h.sF(function (data) {
			result = data;
			if (key) {
				this.parallel.unflatten();
				KeyApi.getWData(view, data.key, this.parallel(), true);
				if (data.additionalKey) {
					KeyApi.getWData(view, data.additionalKey, this.parallel(), true);
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
			result.receiver = receiver.map(h.parseDecimal);

			theTopic.getUnreadMessages(view, this);
		}), h.sF(function (unreadMessages) {
			result.unread = unreadMessages;

			if (h.parseDecimal(result.newest) !== 0) {
				var Message = require("./messages");
				var newest = new Message(result.newest);
				newest.getFullData(view, this, true);
			} else {
				this.ne();
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
			client.zcard(domain + ":user:" + view.session.getUserID() + ":messages", this);
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
			client.zcard(domain + ":user:" + view.session.getUserID() + ":unread", this);
		}, h.sF(function (count) {
			this.ne(count !== 0);
		}), cb);
	};

	/** get unread messages ids */
	this.getUnreadMessages = function getUnreadMessagesF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.zrevrange(domain + ":user:" + view.session.getUserID() + ":unread", 0, -1, this);
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
			client.zremrangebyscore(domain + ":user:" + view.session.getUserID() + ":unread", "-inf", beforeTime, this);
		}), h.sF(function () {
			theTopic.isUnread(view, this);
		}), h.sF(function (isUnread) {
			unread = isUnread;
			if (!isUnread) {
				client.zrem("topic:user:" + view.session.getUserID() + ":unreadTopics", id, this.parallel());
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
			theTopic.getReceiver(view, this.parallel());
		}), h.sF(function (senderid, time, receiver) {
			theReceiver = receiver;
			theSender = senderid;
			var multi = client.multi();
			messageID = message.getID();

			multi.zadd(mDomain, time, messageID);
			multi.zadd(domain + ":user:" + senderid + ":messages", time, messageID);

			theReceiver.forEach(function (receiver) {
				var rid = receiver.getID();

				if (rid !== h.parseDecimal(theSender)) {
					multi.zadd("topic:user:" + rid + ":unreadTopics", time, id);
					multi.zadd(domain + ":user:" + rid + ":unread", time, messageID);					
				}

				multi.zadd("topic:user:" + rid + ":topics", time, id);
			});

			multi.hmset(domain + ":data", {
				"newest": messageID,
				"newestTime": time
			});

			multi.exec(this);
		}), h.sF(function () {
			theReceiver.forEach(function (user) {
				user.isOnline(this.parallel());
			}, this);
		}), h.sF(function (onlineUsers) {
			var offlineUsers = [];

			theReceiver.forEach(function (user, index) {
				if (onlineUsers[index]) {
					client.publish("user:" + user.getID() + ":message", messageID);
				} else {
					offlineUsers.push(user);
				}
			});

			mailer.sendInteractionMails(offlineUsers);

			this.ne();
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
		var remaining = 0;
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			this.parallel.unflatten();

			client.zrevrank(mDomain, afterMessage, this.parallel());
			client.zcard(mDomain, this.parallel());
		}), h.sF(function (index, card) {
			if (index === null) {
				index = -1;
			}

			remaining = card - index - count;

			client.zrevrange(mDomain, index + 1, index + count, this);
		}), h.sF(function (messageids) {
			var Message = require("./messages");
			var result = [], i;
			for (i = 0; i < messageids.length; i += 1) {
				result.push(new Message(messageids[i], theTopic));
			}

			this.ne({
				messages: result,
				remaining: remaining > 0 ? remaining : 0
			});
		}), cb);
	};

	/** get topic data */
	this.getTData = function getTDataF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.hgetall(domain + ":data", this.parallel());
			client.hget(domain + ":receiverKeys", view.session.getUserID(), this.parallel());
		}), h.sF(function (data, key) {
			if (key) {
				data.additionalKey = key;
			}

			data.createTime = h.parseDecimal(data.createTime);
			data.creator = h.parseDecimal(data.creator);

			this.ne(data);
		}), cb);
	};
};

Topic.unreadCount = function (view, cb) {
	step(function () {
		client.zcard("topic:user:" + view.session.getUserID() + ":unreadTopics", this);
	}, cb);
};

Topic.unread = function (view, cb) {
	step(function () {
		client.zrevrange("topic:user:" + view.session.getUserID() + ":unreadTopics", 0, -1, this);
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
		client.zrevrank("topic:user:" + view.session.getUserID() + ":topics", afterTopic, this);
	}, h.sF(function (index) {
		if (index === null) {
			index = -1;
		}

		client.zrevrange("topic:user:" + view.session.getUserID() + ":topics", index + 1, index + count, this);
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
			throw new TopicNotExisting(topicid);
		}
	}), cb);
};

Topic.getUserTopicID = function (view, userid, cb) {
	step(function () {
		client.get("topic:user:" + view.session.getUserID() + ":single:" + userid, this);
	}, h.sF(function (topicid) {
		if (topicid) {
			this.ne(topicid);
		} else {
			this.ne(false);
		}
	}), cb);
};

Topic.create = function (view, data, receiverKeys, cb) {
	var User = require("./user.js");

	//TODO: check user can read their crypto key

	function hasUserKeyAccess(uid, key, cb) {
		step(function () {
			KeyApi.get(key, this);
		}, h.sF(function (key) {
			key.hasUserAccess(uid, this);
		}), cb);
	}

	var receiverIDs, receiverWO, theTopicID;
	step(function () {
		var err = validator.validate("topicCreate", data);

		if (err) {
			throw new InvalidTopicData();
		}

		if (!view.session.isMyID(data.creator)) {
			throw new InvalidTopicData();
		}

		if (Math.abs(data.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidTopicData();
		}

		receiverIDs = data.receiver.map(h.parseDecimal);
		receiverWO = receiverIDs.filter(h.not(view.session.isMyID));

		User.checkUserIDs(receiverIDs, this.parallel());
	}, h.sF(function () {
		receiverWO.forEach(function (uid) {
			hasUserKeyAccess(uid, data.key, this.parallel());
			hasUserKeyAccess(uid, data.receiverKeys[uid], this.parallel());
		}, this);

		if (receiverWO.length === 0) {
			this.ne([]);
		}
	}), h.sF(function (keysAccessible) {
		keysAccessible.forEach(function (keyAccessible) {
			if (!keyAccessible) {
				throw new Error("keys might not be accessible by all user");
			}
		});

		client.incr("topic:topics", this);
	}), h.sF(function (topicid) {
		theTopicID = topicid;

		var topicData = data;

		topicData.newest = 0;
		topicData.topicid = topicid;

		var multi = client.multi();

		receiverIDs.forEach(function (uid) {
			multi.zadd("topic:user:" + uid + ":topics", new Date().getTime(), topicid);
			if (!view.session.isMyID(uid)) {
				multi.hset("topic:" + topicid + ":receiverKeys", uid, receiverKeys[uid]);
			}
		});

		if (receiverIDs.length === 2) {
			multi.set("topic:user:" + receiverIDs[0] + ":single:" + receiverIDs[1], topicid);
			multi.set("topic:user:" + receiverIDs[1] + ":single:" + receiverIDs[0], topicid);
		} else if (receiverIDs.length === 1) {
			multi.set("topic:user:" + receiverIDs[0] + ":single:" + receiverIDs[0], topicid);
		}

		multi.hmset("topic:" + topicid + ":data", topicData);
		multi.sadd("topic:" + topicid + ":receiver", receiverIDs);

		multi.exec(this);
	}), h.sF(function () {
		this.ne(new Topic(theTopicID));
	}), cb);
};

module.exports = Topic;