"use strict";

var Topic = require("./topic");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var KeyApi = require("./crypto/KeyApi");

var mailer = require("./mailer");

var config = require("./configManager").get();

//maximum difference: 60 minutes.
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

const topicUpdateModel = require("./models/topicUpdate");

const updateServer = (succID, myID) => {
	return client.hgetallAsync(`topic:${myID}:server`).then((myServer) => {
		console.log(myServer)
		return Bluebird.all([
			client.hsetAsync(`topic:${myID}:server`, "successor", succID),
			client.hmsetAsync(`topic:${succID}:server`, {
				newest: myServer.newest,
				newestTime: myServer.newestTime
			})
		])
	})
}

const removeTopicList = (succID, myID) => {
	return client.smembersAsync("topic:" + succID + ":receiver").map((receiverID) => {
		return client.zremAsync("topic:user:" + receiverID + ":topics", myID)
	})
}

const copyPredecessors = (succID, myID) => {
	return client.lrangeAsync(`topic:${myID}:predecessors`, 0, -1).then((predecessors) => {
		predecessors.push(myID)

		return client.lpushAsync(`topic:${succID}:predecessors`, myID, ...predecessors)
	})
}

function pushMessage(request, theReceiver, senderName, message) {
	const receivers = theReceiver.filter(function (user) {
		return user.getID() !== request.session.getUserID();
	});

	return message.getFullData(request).then(function (messageData) {
		return Bluebird.resolve(receivers).map(function (user) {
			var referenceType = "message";

			return pushAPI.getTitle(user, referenceType, senderName).then(function (title) {
				return Bluebird.all([
					pushAPI.notifyUser(user.getID(), title, {
						type: referenceType,
						id: messageData.meta.topicid
					}),
					pushAPI.updateBadgeForUser(user.getID()),
					pushAPI.pushDataToUser(user.getID(), { message: messageData })
				]);
			})
		});
	}).catch(errorService.handleError)
}

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	var mDomain = domain + ":messages";
	this.getID = function() {
		return id;
	};

	var hasAccess = [];

	/** throw an error if the current user can not access this topic */
	function hasAccessError(request, cb) {
		return theTopic.hasAccess(request).then(function (access) {
			if (access !== true) {
				throw new AccessViolation("topic");
			}
		}).nodeify(cb);
	}

	this.removeSingleByID = function (receiverID1, receiverID2) {
		const key = `topic:user:${receiverID1}:single:${receiverID2}`

		return client.getAsync(key).then((topicID) => {
			if (h.parseDecimal(topicID) === h.parseDecimal(this.getID())) {
				return client.delAsync(key);
			}
		})
	}

	this.removeSingle = function () {
		return client.smembersAsync(domain + ":receiver").then((receiverIDs) => {
			if (receiverIDs.length === 2) {
				return Bluebird.all([
					this.removeSingleByID(receiverIDs[0], receiverIDs[1]),
					this.removeSingleByID(receiverIDs[1], receiverIDs[0])
				])
			}

			if (receiverIDs.length === 1) {
				return this.removeSingleByID(receiverIDs[0], receiverIDs[0])
			}
		})
	}

	this.getTopicUpdatesBetween = function (request, firstMessageID, lastMessageID) {
		return theTopic.hasAccess(request).then(function () {
			return Bluebird.all([
				client.zscoreAsync(mDomain, firstMessageID),
				client.zscoreAsync(mDomain, lastMessageID),
			]);
		}).spread((min, max) => {
			const startDate = new Date(h.parseDecimal(min));
			const endDate = max ? new Date(h.parseDecimal(max)) : new Date()

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
		return theTopic.hasAccess(request).then(() => {
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
		return theTopic.hasAccess(request).then(function () {
			return client.zscoreAsync(mDomain, newestMessageID);
		}).then((newestTime) => {
			if (!newestTime) {
				return []
			}

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
		return theTopic.hasAccess(request).then(function () {
			topicUpdate.topicID = id;
			return topicUpdateModel.create(topicUpdate);
		}).then((topicUpdate) => {
			return topicUpdate.id;
		}).nodeify(cb);
	};

	/** has the current user access? */
	this.hasAccess = function (request, cb) {
		const uid = request.session.getUserID()

		if (hasAccess.indexOf(uid) > -1) {
			return Bluebird.resolve(true).nodeify(cb);
		}

		return client.sismemberAsync(domain + ":receiver", uid).then((member) => {
			if (member === 1) {
				hasAccess.push(uid);
				return true
			}

			return false
		}).nodeify(cb)
	};

	this.markUnreadForOthers = (request) => {
		return this.getReceiverIDs(request).filter((userID) => !request.session.isMyID(userID)).map((userID) => {
			return client.zaddAsync(`topic:user:${userID}:unreadTopics`, Date.now(), this.getID())
		})
	}

	this.markReadForAll = (request) => {
		return this.getReceiverIDs(request).map((userID) => {
			return client.zremAsync(`topic:user:${userID}:unreadTopics`, this.getID())
		})
	}

	/** get receiver ids */
	this.getReceiverIDs = function(request, cb) {
		return hasAccessError(request).then(() => {
			return client.smembersAsync(domain + ":receiver")
		}).nodeify(cb)
	};

	/** get receiver objects */
	this.getReceiver = function(request, cb) {
		var User = require("./user");

		return theTopic.getReceiverIDs(request).map(function(receiver) {
			return Bluebird.fromCallback((cb) => {
				User.getUser(receiver, cb)
			})
		}).nodeify(cb);
	};

	/** get receiver user data */
	this.getReceiverData = function getReceiverDataF(request, cb) {
		return theTopic.getReceiver(request).map((receiver) => {
			return Bluebird.fromCallback((cb) => receiver.getUData(request, cb))
		}).nodeify(cb)
	};

	this.isAdmin = (request) => {
		return client.hgetAsync(domain + ":meta", "creator").then((creator) => {
			return request.session.isMyID(creator)
		})
	}

	this.getSuccessorID = function (cb) {
		return client.hgetAsync(domain + ":server", "successor").nodeify(cb)
	}

	this.setSuccessor = function (request, successor, receiverKeys) {
		return Bluebird.all([
			theTopic.isAdmin(request),
			theTopic.getSuccessorID(),
			client.hgetAsync(domain + ":meta", "_ownHash")
		]).then(function ([isAdmin, hasSuccessor, checksum]) {
			if (!isAdmin) {
				throw new AccessViolation("topic: not an admin")
			}

			if (hasSuccessor) {
				throw new SuccessorError("already has a successor")
			}

			if (checksum !== successor._parent) {
				throw new Error("Invalid parent checksum")
			}

			return Bluebird.fromCallback((cb) => Topic.create(request, successor, receiverKeys, cb))
		}).then((successorTopic) => {
			const succID = successorTopic.getID()
			const myID = theTopic.getID()

			return Bluebird.all([
				updateServer(succID, myID),
				removeTopicList(succID, myID),
				copyPredecessors(succID, myID),
				this.markReadForAll(request),
				successorTopic.markUnreadForOthers(request),
				this.removeSingle(),
			]).then(() => {
				return successorTopic.notifyReceivers(request, "topic", successorTopic.getID())
			}).thenReturn(successorTopic)
		})
	}

	this.getPredecessor = function (request) {
		return hasAccessError(request).then(() => {
			return client.hgetAsync(`${domain}:meta`, "predecessor")
		}).then((predecessorID) => {
			if (!predecessorID) {
				return null
			}

			const topic = new Topic(predecessorID)

			return topic.hasAccess(request).then((hasAccess) => {
				if (!hasAccess) {
					return null
				}

				return topic
			})
		})
	}

	this.getPredecessorsMessageCounts = function (request) {
		return hasAccessError(request).then(() => {
			return client.lrangeAsync(`${domain}:predecessors`, 0, -1)
		}).map((predecessorID) => {
			return new Topic(predecessorID).getMessagesCount(request).then((count) => {
				return {
					topicID: predecessorID,
					remainingCount: count
				}
			})
		})
	}

	this.getSuccessor = function (request) {
		return hasAccessError(request).then(function () {
			return client.hgetAsync(domain + ":server", "successor")
		}).then(function (successorID) {
			if (!successorID) {
				return Bluebird.resolve(null)
			}

			return Topic.get(successorID)
		})
	}

	/** get topic full data */
	this.getFullData = function (request, cb) {
		var server, meta;
		return theTopic.getTData(request).then(function ({ server: _server, meta: _meta, additionalKey }) {
			server = _server;
			meta = _meta;

			return Bluebird.all([
				request.addKey(_meta._key),
				additionalKey ? request.addKey(additionalKey) : null
			])
		}).then(function () {
			return theTopic.getReceiverIDs(request);
		}).then(function (receiver) {
			meta.receiver = receiver.map(h.parseDecimal);

			return theTopic.getUnreadMessages(request);
		}).then(function (unreadMessages) {
			server.unread = unreadMessages;

			if (h.parseDecimal(server.newest) !== 0) {
				var Message = require("./messages");
				var newest = new Message(server.newest);

				return newest.hasAccess(request).then((hasAccess) => {
					if (!hasAccess) {
						return
					}

					return newest.getFullData(request)
				})
			}
		}).then(function (newest) {
			server.newest = newest;
			server.meta = meta;

			if (newest) {
				return theTopic.getTopicUpdatesAfterNewestMessage(request, newest.meta.messageid);
			}

			return [];
		}).then(function (latestTopicUpdates) {
			server.latestTopicUpdate = h.array.last(latestTopicUpdates);
			server.latestTopicUpdates = latestTopicUpdates;

			return server
		}).nodeify(cb)
	};

	/** how many messages in this topic? */
	this.ownCount = function(request, cb) {
		return hasAccessError(request).then(() => {
			return client.zcardAsync(domain + ":user:" + request.session.getUserID() + ":messages");
		}).nodeify(cb)
	};

	/** how many messages in this topic? */
	this.messageCount = function(request, cb) {
		return hasAccessError(request).then(() => {
			return client.zcardAsync(mDomain);
		}).nodeify(cb)
	};

	/** is this topic empty? */
	this.isEmpty = function(request, cb) {
		return theTopic.messageCount().then(function (messageCount) {
			return messageCount === 0;
		}).nodeify(cb);
	};

	/** is this topic unread? */
	this.isUnread = function(request, cb) {
		return client.zcardAsync(domain + ":user:" + request.session.getUserID() + ":unread").then((count) => {
			return count !== 0
		}).nodeify(cb)
	};

	/** get unread messages ids */
	this.getUnreadMessages = function(request, cb) {
		return hasAccessError(request).then(function () {
			return client.zrevrangeAsync(domain + ":user:" + request.session.getUserID() + ":unread", 0, -1);
		}).then(function (res) {
			return res.map(function (ele) {
				return h.parseDecimal(ele);
			});
		}).nodeify(cb);
	};

	this.refetch = function (request, data, cb) {
		return Bluebird.resolve({
			clearMessages: false,
			messages: []
		}).nodeify(cb)
	};

	/** mark certain messages read */
	this.markMessagesRead = function (request, beforeTime, cb) {
		var unread = false;
		return hasAccessError(request).then(() => {
			return client.zremrangebyscoreAsync(domain + ":user:" + request.session.getUserID() + ":unread", "-inf", beforeTime);
		}).then(() => {
			return theTopic.isUnread(request);
		}).then((isUnread) => {
			unread = isUnread;
			if (!isUnread) {
				request.socketData.notifyOwnClients("topicRead", id);

				return client.zrem("topic:user:" + request.session.getUserID() + ":unreadTopics", id);
			}
		}).then(() => {
			if (unread) {
				return theTopic.getUnreadMessages(request);
			}

			return []
		}).nodeify(cb);
	};

	this.notifyReceivers = function (request, type, data) {
		return Bluebird.fromCallback((cb) => {
			theTopic.getReceiver(request, cb);
		}).each((receiver) => {
			receiver.notify(type, data)
		})
	}

	/** add a message to this topic */
	this.addMessage = (request, message, cb) => {
		var theReceiver, theSender, messageID;

		return hasAccessError(request).then(() => {
			//TO-DO check that all receiver have access to the messageKey

			return Bluebird.all([
				message.getSenderID(request),
				message.getTime(request),
				this.getReceiver(request),
			])
		}).then(([senderid, time, receiver]) => {
			theReceiver = receiver;
			theSender = senderid;
			var multi = client.multi();
			messageID = message.getID();

			multi.zadd(mDomain, time, messageID);
			multi.zadd(domain + ":user:" + senderid + ":messages", time, messageID);

			theReceiver.forEach((receiver) => {
				var rid = receiver.getID();

				if (rid !== h.parseDecimal(theSender)) {
					multi.zadd("topic:user:" + rid + ":unreadTopics", time, id);
					multi.zadd(domain + ":user:" + rid + ":unread", time, messageID);
				}

				multi.zadd("topic:user:" + rid + ":topics", time, id);
				multi.zadd("topic:user:" + rid + ":topicsWithPredecessors", time, id);
			});

			multi.hmset(domain + ":server", {
				"newest": messageID,
				"newestTime": time
			});

			return Bluebird.fromCallback((cb) => multi.exec(cb))
		}).then(() => {
			this.notifyReceivers(request, "message", messageID)

			var senderObject = theReceiver.filter((u) => {
				return u.getID() === h.parseDecimal(theSender);
			})[0];

			return senderObject.getNames(request);
		}).then((sender) => {
			sender = sender.firstName || sender.lastName || sender.nickname;
			pushMessage(request, theReceiver, sender, message);
			mailer.sendInteractionMails(theReceiver, "message", "new", {
				sender: sender,
				interactionID: id
			});

			return true;
		}).nodeify(cb);
	};

	/** get the newest message
	* @param request request
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getNewest = function getNewestF(request, cb) {
		return hasAccessError(request).then(() => {
			return client.zrevrangeAsync(mDomain, 0, 0);
		}).then(function (messageids) {
			if (messageids.length === 1) {
				var Message = require("./messages");
				return new Message(messageids[0]);
			}

			return 0;
		}).nodeify(cb)
	};

	this.getMessagesCount = function (request) {
		return this.hasAccess(request).then((hasAccess) => {
			if (!hasAccess) {
				return 0
			}

			return client.zcardAsync(mDomain);
		})
	}

	/** get the messages after a certain message
	* @param request request
	* @param afterMessage message after which to start
	* @param count number of messages to get
	* @param cb cb
	*/
	this.getMessages = function (request, afterMessage, count) {
		var remaining = 0;
		return hasAccessError(request).then(() => {
			return Bluebird.all([
				client.zrevrankAsync(mDomain, afterMessage),
				client.zcardAsync(mDomain),
			])
		}).then(function ([index, card]) {
			if (index === null) {
				index = -1
			}

			remaining = card - index - count;

			return client.zrevrangeAsync(mDomain, index + 1, index + count);
		}).then(function (messageids) {
			var Message = require("./messages");

			const result = messageids.map((messageid) => {
				return new Message(messageid)
			})

			return {
				messages: result,
				remaining: remaining > 0 ? remaining : 0
			}
		})
	};

	/** get topic data */
	this.getTData = function (request) {
		return hasAccessError(request).then(() => {
			return Bluebird.all([
				client.hgetallAsync(domain + ":server"),
				client.hgetallAsync(domain + ":meta"),

				client.hgetAsync(domain + ":receiverKeys", request.session.getUserID()),
			])
		}).then(function ([server, meta, additionalKey]) {
			meta.createTime = h.parseDecimal(meta.createTime);
			meta.creator = h.parseDecimal(meta.creator);

			if (meta.addedReceivers) {
				meta.addedReceivers = JSON.parse(meta.addedReceivers)
			}

			return { server, meta, additionalKey };
		})
	};
};

Topic.unreadIDs = function (request, cb) {
	const userID = request.session.getUserID()

	return client.zrevrangeAsync(`topic:user:${userID}:unreadTopics`, 0, -1).nodeify(cb)
};

Topic.unreadCount = function (request, cb) {
	const userID = request.session.getUserID()

	return client.zcardAsync(`topic:user:${userID}:unreadTopics`).nodeify(cb)
};

Topic.unread = function (request, cb) {
	return client.zrevrangeAsync("topic:user:" + request.session.getUserID() + ":unreadTopics", 0, -1).map((unreadID) => {
		return new Topic(unreadID)
	}).nodeify(cb);
};

Topic.own = function (request, afterTopic, count, cb) {
	const topicsListKey = "topic:user:" + request.session.getUserID() + ":topics"

	return client.zrevrankAsync(topicsListKey, afterTopic).then(function (index) {
		if (index === null) {
			index = -1;
		}

		return client.zrevrangeAsync(topicsListKey, index + 1, index + count);
	}).map(function (topicid) {
		return new Topic(topicid)
	}).nodeify(cb);
};

Topic.get = function (topicid, cb) {
	if (!topicid) {
		console.trace()
	}

	return Bluebird.try(function () {
		return client.existsAsync("topic:" + topicid + ":server");
	}).then(function (exists) {
		if (exists === 1) {
			return new Topic(topicid);
		}

		throw new TopicNotExisting(topicid);
	}).nodeify(cb)
};

Topic.getUserTopicID = function (request, userid, cb) {
	return client.getAsync("topic:user:" + request.session.getUserID() + ":single:" + userid).then(function (topicid) {
		if (topicid) {
			return topicid
		}

		return false
	}).nodeify(cb)
};

Topic.create = function (request, topicMeta, receiverKeys, cb) {
	var User = require("./user.js");

	function ensureUserKeyAccess(uid, key) {
		return KeyApi.get(key).then(function (key) {
			return key.hasUserAccess(uid);
		}).then((access) => {
			if (!access) {
				throw new Error("keys might not be accessible by all user");
			}
		})
	}

	var receiverIDs, receiverWO, theTopicID;
	return Bluebird.try(function () {
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

		return User.checkUserIDs(receiverIDs);
	}).then(function () {
		return Bluebird.resolve(receiverWO).map(function (uid) {
			return Bluebird.all([
				ensureUserKeyAccess(uid, topicMeta._key),
				ensureUserKeyAccess(uid, receiverKeys[uid]),
			])
		});
	}).then(function () {
		return client.incrAsync("topic:topics");
	}).then(function (topicid) {
		theTopicID = topicid;

		var topicServer = {};

		topicServer.newest = 0;
		topicServer.topicid = topicid;
		topicServer.createServerTime = new Date().getTime()

		var multi = client.multi();

		receiverIDs.forEach(function (uid) {
			multi.zadd("topic:user:" + uid + ":topics", new Date().getTime(), topicid);
			multi.zadd("topic:user:" + uid + ":topicsWithPredecessors", new Date().getTime(), topicid);
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

		if (topicMeta.addedReceivers) {
			topicMeta.addedReceivers = JSON.stringify(topicMeta.addedReceivers)
		}

		multi.hmset("topic:" + topicid + ":server", topicServer);
		multi.hmset("topic:" + topicid + ":meta", topicMeta);
		multi.sadd("topic:" + topicid + ":receiver", receiverIDs);

		return Bluebird.fromCallback((cb) => multi.exec(cb))
	}).then(function () {
		return new Topic(theTopicID)
	}).nodeify(cb);
};

var base = "db:" + (config.db.number || 0) + ":observer:user:";
client.psub(base + "*:topicRead", function (channel) {
	var userID = h.parseDecimal(channel.substr(base.length).replace(":topicRead", ""));

	pushAPI.updateBadgeForUser(userID);
});

module.exports = Topic;
