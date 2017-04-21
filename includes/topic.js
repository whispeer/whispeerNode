"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var KeyApi = require("./crypto/KeyApi");

var mailer = require("./mailer");

var config = require("./configManager").get();

//maximum difference: 5 minutes.
var MAXTIME = 60 * 60 * 1000;

/*
	topic: {
		createTime: (int)
		_key: key,
		cryptKeys: [key],
		receiver: (int),
		creator: (int),
		newest (int),
		unread: (bool)
	}

*/

var errorService = require("./errorService");
var pushAPI = require("./pushAPI");
var Bluebird = require("bluebird");

const topicUpdateModel = require("./models/topicUpdateModel");

function pushMessage(request, theReceiver, senderName, message) {
	step(function () {
		message.getFullData(request, this, true);
	}, h.sF(function (messageData) {
		var receivers = theReceiver.filter(function (user) {
			return user.getID() !== request.session.getUserID();
		});

		return Bluebird.resolve(receivers).map(function (user) {
			var referenceType = "message";

			return Bluebird.all([
				pushAPI.notifyUser(user, pushAPI.getTitle(user, referenceType, senderName), {
					type: referenceType,
					id: messageData.meta.topicid
				}),
				pushAPI.updateBadge(user.getID()),
				pushAPI.dataUser(user, { message: messageData })
			]);
		});
	}), errorService.handleError);
}

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	var mDomain = domain + ":messages";
	this.getID = function getIDF() {
		return id;
	};

	var hasAccess = [];

	/** throw an error if the current user can not access this topic */
	function hasAccessError(request, cb) {
		step(function hAE1() {
			theTopic.hasAccess(request, this);
		}, h.sF(function hAE2(access) {
			if (access !== true) {
				throw new AccessViolation("topic");
			}

			this.ne();
		}), cb);
	}

	this.getTopicUpdatesBetween = function (request, firstMessageID, lastMessageID) {
		return theTopic.hasAccessAsync(request).then(function () {
			return Bluebird.all([
				client.zscoreAsync(mDomain, firstMessageID),
				client.zscoreAsync(mDomain, lastMessageID),
			]);
		}).spread((min, max) => {
			const startDate = new Date(h.parseDecimal(min));
			const endDate = new Date(h.parseDecimal(max));

			return topicUpdateModel.findAll({
				where: {
					topicID: id,
					createdAt: {
						$gte: startDate,
						$lte: endDate
					}
				},
				order: [
					["createdAt", "DESC"]
				]
			});
		}).then(function (topicUpdates) {
			return topicUpdates.map((topicUpdate) => topicUpdate.getAPIFormatted());
		});
	};

	this.getLatestTopicUpdate = function (request) {
		return theTopic.hasAccessAsync(request).then(() => {
			return topicUpdateModel.findOne({
				where: {
					topicID: id
				},
				order: [
					["createdAt", "DESC"]
				]
			});
		}).then((topicUpdate) => {
			if (!topicUpdate) {
				return;
			}

			return topicUpdate.getAPIFormatted();
		});
	};

	this.getTopicUpdatesAfterNewestMessage = function (request, newestMessageID, cb) {
		return theTopic.hasAccessAsync(request).then(function () {
			return client.zscoreAsync(mDomain, newestMessageID);
		}).then((newestTime) => {
			return topicUpdateModel.findAll({
				where: {
					topicID: id,
					createdAt: {
						$gte: new Date(h.parseDecimal(newestTime))
					}
				},
				order: [
					["createdAt", "DESC"]
				]
			});
		}).then((topicUpdates) => {
			if (topicUpdates.length !== 0) {
				return topicUpdates.map((topicUpdate) => topicUpdate.getAPIFormatted());
			}

			return this.getLatestTopicUpdate(request).then((topicUpdate) => {
				if (!topicUpdate) {
					return [];
				}

				return [topicUpdate];
			});
		}).nodeify(cb);
	};

	this.createTopicUpdate = function (request, topicUpdate, cb) {
		return theTopic.hasAccessAsync(request).then(function () {
			topicUpdate.topicID = id;
			return topicUpdateModel.create(topicUpdate);
		}).then((topicUpdate) => {
			return topicUpdate.id;
		}).nodeify(cb);
	};

	/** has the current user access? */
	this.hasAccess = function hasAccessF(request, cb) {
		var uid;
		step(function hA1() {
			uid = request.session.getUserID();
			if (hasAccess.indexOf(uid) > -1) {
				this.last.ne(true);
			}

			client.sismember(domain + ":receiver", uid, this);
		}, h.sF(function hA2(member) {
			hasAccess.push(uid);
			this.ne(member === 1);
		}), cb);
	};

	this.hasAccessAsync = Bluebird.promisify(this.hasAccess, this);

	/** get receiver ids */
	this.getReceiverIDs = function getReceiverIDsF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.smembers(domain + ":receiver", this);
		}), cb);
	};

	/** get receiver objects */
	this.getReceiver = function getReceiverF(request, cb) {
		step(function () {
			theTopic.getReceiverIDs(request, this);
		}, h.sF(function(receivers) {
			var User = require("./user");

			var i;
			for (i = 0; i < receivers.length; i += 1) {
				User.getUser(receivers[i], this.parallel());
			}
		}), cb);
	};

	/** get receiver user data */
	this.getReceiverData = function getReceiverDataF(request, cb) {
		step(function () {
			theTopic.getReceiver(request, this);
		}, h.sF(function (receivers) {
			var i;
			for (i = 0; i < receivers.length; i += 1) {
				receivers[i].getUData(request, this.parallel());
			}
		}), cb);
	};

	/** get topic full data */
	this.getFullData = function (request, cb) {
		var server, meta;
		step(function () {
			theTopic.getTData(request, this);
		}, h.sF(function (_server, _meta, additionalKey) {
			server = _server;
			meta = _meta;
			request.addKey(_meta._key, this.parallel());
			if (additionalKey) {
				request.addKey(additionalKey, this.parallel());
			}
		}), h.sF(function () {
			theTopic.getReceiverIDs(request, this);
		}), h.sF(function (receiver) {
			meta.receiver = receiver.map(h.parseDecimal);

			theTopic.getUnreadMessages(request, this);
		}), h.sF(function (unreadMessages) {
			server.unread = unreadMessages;

			if (h.parseDecimal(server.newest) !== 0) {
				var Message = require("./messages");
				var newest = new Message(server.newest);
				newest.getFullData(request, this, true);
			} else {
				this.ne();
			}
		}), h.sF(function (newest) {
			server.newest = newest;
			server.meta = meta;

			if (newest) {
				theTopic.getTopicUpdatesAfterNewestMessage(request, newest.meta.messageid, this);
			} else {
				this.ne([]);
			}
		}), h.sF(function (latestTopicUpdates) {
			server.latestTopicUpdate = h.array.last(latestTopicUpdates);
			server.latestTopicUpdates = latestTopicUpdates;

			this.ne(server);
		}), cb);
	};

	/** how many messages in this topic? */
	this.ownCount = function ownCountF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.zcard(domain + ":user:" + request.session.getUserID() + ":messages", this);
		}), cb);
	};

	/** how many messages in this topic? */
	this.messageCount = function messageCountF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.zcard(mDomain, this);
		}), cb);
	};

	/** is this topic empty? */
	this.isEmpty = function isEmptyF(request, cb) {
		step(function () {
			theTopic.messageCount(this);
		}, h.sF(function (messageCount) {
			this.ne(messageCount === 0);
		}), cb);
	};

	/** is this topic unread? */
	this.isUnread = function isUnreadF(request, cb) {
		step(function () {
			client.zcard(domain + ":user:" + request.session.getUserID() + ":unread", this);
		}, h.sF(function (count) {
			this.ne(count !== 0);
		}), cb);
	};

	/** get unread messages ids */
	this.getUnreadMessages = function getUnreadMessagesF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.zrevrange(domain + ":user:" + request.session.getUserID() + ":unread", 0, -1, this);
		}), h.sF(function (res) {
			res.map(function (ele) {
				return parseInt(ele, 10);
			});

			this.ne(res);
		}), cb);
	};

	this.getMissingMessages = function (inBetween, newestIndex, oldestIndex) {
		return client.zrevrangeAsync(mDomain, newestIndex + 1, oldestIndex - 1).map(h.parseDecimal).then(function (ids) {
			return h.arraySubtract(ids, inBetween);
		});
	};

	this.getMessagesBefore = function (newestIndex) {
		return client.zrevrangeAsync(mDomain, 0, newestIndex - 1);
	};

	this.getNewestMessages = function (count) {
		return client.zrevrangeAsync(mDomain, 0, count - 1);
	};

	this.refetch = function (request, data, cb) {
		var oldest = data.oldest,
			newest = data.newest,
			inBetween = data.inBetween,
			maximum = data.maximum,
			messageCountOnFlush = data.messageCountOnFlush;

		var hasAccessErrorAsync = Bluebird.promisify(hasAccessError);
		var clearMessages = false;

		var resultPromise = hasAccessErrorAsync(request).bind(this).then(function () {
			return Bluebird.all([
				client.zrevrankAsync(mDomain, oldest),
				client.zrevrankAsync(mDomain, newest),
			]);
		}).spread(function (oldestIndex, newestIndex) {
			var missingNewCount = newestIndex;
			var missingMessageCount = oldestIndex - newestIndex - inBetween.length - 1;

			if (missingMessageCount + missingNewCount > maximum) {
				clearMessages = true;
				return this.getNewestMessages(messageCountOnFlush);
			}

			if (missingNewCount === 0 && missingMessageCount === 0) {
				return [];
			}

			var requests = [];

			if (missingNewCount > 0) {
				requests.push(this.getMessagesBefore(newestIndex));
			}

			if (missingMessageCount > 0) {
				requests.push(this.getMissingMessages(inBetween, newestIndex, oldestIndex));
			}

			return Bluebird.all(requests);
		}).then(function (data) {
			return h.array.flatten(data);
		}).map(function (missingMessageID) {
			var Message = require("./messages");
			return new Message(missingMessageID, theTopic);
		}).map(function (missingMessage) {
			var getFullData = Bluebird.promisify(missingMessage.getFullData, missingMessage);
			return getFullData(request);
		}).then(function (data) {
			return {
				clearMessages: clearMessages,
				messages: data
			};
		});

		return step.unpromisify(resultPromise, cb);
	};

	/** mark certain messages read */
	this.markMessagesRead = function markRead(request, beforeTime, cb) {
		var unread = false;
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.zremrangebyscore(domain + ":user:" + request.session.getUserID() + ":unread", "-inf", beforeTime, this);
		}), h.sF(function () {
			theTopic.isUnread(request, this);
		}), h.sF(function (isUnread) {
			unread = isUnread;
			if (!isUnread) {
				client.zrem("topic:user:" + request.session.getUserID() + ":unreadTopics", id, this.parallel());

				request.socketData.notifyOwnClients("topicRead", id);
			}

			this.parallel()();
		}), h.sF(function () {
			if (unread) {
				theTopic.getUnreadMessages(request, this);
			} else {
				this.ne([]);
			}
		}), cb);
	};

	/** add a message to this topic */
	this.addMessage = function addMessageF(request, message, cb) {
		var theReceiver, theSender, messageID;
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			//TO-DO check that all receiver have access to the messageKey
			this.parallel.unflatten();

			message.getSenderID(request, this.parallel());
			message.getTime(request, this.parallel());
			theTopic.getReceiver(request, this.parallel());
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

			multi.hmset(domain + ":server", {
				"newest": messageID,
				"newestTime": time
			});

			multi.exec(this);
		}), h.sF(function () {
			theReceiver.forEach(function (user) {
				user.isOnline(this.parallel());
			}, this);
		}), h.sF(function (onlineUsers) {
			theReceiver.forEach(function (user, index) {
				if (onlineUsers[index]) {
					user.notify("message", messageID);
				}
			});

			var senderObject = theReceiver.filter(function (u) {
				return u.getID() === h.parseDecimal(theSender);
			})[0];

			senderObject.getNames(request, this);

		}), h.sF(function (sender) {
			sender = sender.firstName || sender.lastName || sender.nickname;
			pushMessage(request, theReceiver, sender, message);
			mailer.sendInteractionMails(theReceiver, "message", "new", {
				sender: sender,
				interactionID: id
			});

			this.ne(true);
		}), cb);
	};

	/** get the newest message
	* @param request request
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getNewest = function getNewestF(request, cb) {
		step(function () {
			hasAccessError(request, this);
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
	* @param request request
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getMessages = function getMessagesF(request, afterMessage, count, cb) {
		var remaining = 0;
		step(function () {
			hasAccessError(request, this);
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
	this.getTData = function getTDataF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.hgetall(domain + ":server", this.parallel());
			client.hgetall(domain + ":meta", this.parallel());

			client.hget(domain + ":receiverKeys", request.session.getUserID(), this.parallel());
		}), h.sF(function (server, meta, additionalKey) {
			meta.createTime = h.parseDecimal(meta.createTime);
			meta.creator = h.parseDecimal(meta.creator);

			this.ne(server, meta, additionalKey);
		}), cb);
	};
};

Topic.unreadIDs = function (request, cb) {
	step(function () {
		client.zrevrange("topic:user:" + request.session.getUserID() + ":unreadTopics", 0, -1, this);
	}, cb);
};

Topic.unreadCount = function (request, cb) {
	step(function () {
		client.zcard("topic:user:" + request.session.getUserID() + ":unreadTopics", this);
	}, cb);
};

Topic.unread = function (request, cb) {
	step(function () {
		client.zrevrange("topic:user:" + request.session.getUserID() + ":unreadTopics", 0, -1, this);
	}, h.sF(function (unread) {
		var result = [], i;
		for (i = 0; i < unread.length; i += 1) {
			result.push(new Topic(unread[i]));
		}

		this.ne(result);
	}), cb);
};

Topic.own = function (request, afterTopic, count, cb) {
	step(function () {
		client.zrevrank("topic:user:" + request.session.getUserID() + ":topics", afterTopic, this);
	}, h.sF(function (index) {
		if (index === null) {
			index = -1;
		}

		client.zrevrange("topic:user:" + request.session.getUserID() + ":topics", index + 1, index + count, this);
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
		client.exists("topic:" + topicid + ":server", this);
	}, h.sF(function (exists) {
		if (exists === 1) {
			this.ne(new Topic(topicid));
		} else {
			throw new TopicNotExisting(topicid);
		}
	}), cb);
};

Topic.getUserTopicID = function (request, userid, cb) {
	step(function () {
		client.get("topic:user:" + request.session.getUserID() + ":single:" + userid, this);
	}, h.sF(function (topicid) {
		if (topicid) {
			this.ne(topicid);
		} else {
			this.ne(false);
		}
	}), cb);
};

Topic.create = function (request, topicMeta, receiverKeys, cb) {
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
		var err = validator.validate("topicCreate", topicMeta);

		if (err) {
			throw new InvalidTopicData();
		}

		if (!request.session.isMyID(topicMeta.creator)) {
			throw new InvalidTopicData("session changed? invalid creator!");
		}

		if (Math.abs(topicMeta.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidTopicData("max time exceeded!");
		}

		receiverIDs = topicMeta.receiver;
		receiverWO = receiverIDs.filter(h.not(request.session.isMyID));

		User.checkUserIDs(receiverIDs, this.parallel());
	}, h.sF(function () {
		receiverWO.forEach(function (uid) {
			hasUserKeyAccess(uid, topicMeta._key, this.parallel());
			hasUserKeyAccess(uid, receiverKeys[uid], this.parallel());
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

		var topicServer = {};

		topicServer.newest = 0;
		topicServer.topicid = topicid;

		var multi = client.multi();

		receiverIDs.forEach(function (uid) {
			multi.zadd("topic:user:" + uid + ":topics", new Date().getTime(), topicid);
			if (!request.session.isMyID(uid)) {
				multi.hset("topic:" + topicid + ":receiverKeys", uid, receiverKeys[uid]);
			}
		});

		if (receiverIDs.length === 2) {
			multi.set("topic:user:" + receiverIDs[0] + ":single:" + receiverIDs[1], topicid);
			multi.set("topic:user:" + receiverIDs[1] + ":single:" + receiverIDs[0], topicid);
		} else if (receiverIDs.length === 1) {
			multi.set("topic:user:" + receiverIDs[0] + ":single:" + receiverIDs[0], topicid);
		}

		multi.hmset("topic:" + topicid + ":server", topicServer);
		multi.hmset("topic:" + topicid + ":meta", topicMeta);
		multi.sadd("topic:" + topicid + ":receiver", receiverIDs);

		multi.exec(this);
	}), h.sF(function () {
		this.ne(new Topic(theTopicID));
	}), cb);
};

var base = "db:" + (config.db.number || 0) + ":observer:user:";
client.psub(base + "*:topicRead", function (channel) {
	var userID = h.parseDecimal(channel.substr(base.length).replace(":topicRead", ""));

	pushAPI.updateBadge(userID);
});

module.exports = Topic;
