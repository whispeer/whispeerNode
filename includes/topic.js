"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var KeyApi = require("./crypto/KeyApi");

var mailer = require("./mailer");

var config = require("./configManager").get();

//maximum difference: 5 minutes.
var MAXTIME = 60 * 60 * 1000;

var errorService = require("./errorService");
var pushAPI = require("./pushAPI");
var Bluebird = require("bluebird");

function pushMessage(request, theReceiver, senderName, message) {
	step(function () {
		message.getFullData(request, this, true);
	}, h.sF(function (messageData) {
		var receivers = theReceiver.filter(function (user) {
			return user.getID() !== request.session.getUserID();
		});

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
	}), errorService.handleError);
}

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	var mDomain = domain + ":messages";
	this.getID = function getIDF() {
		return id;
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

	this.createTopicUpdate = function (request, topicUpdate, cb) {
		return theTopic.hasAccessAsync(request).then(function () {
			topicUpdate.topicID = id;
			return topicUpdateModel.create(topicUpdate);
		}).then((topicUpdate) => {
			return topicUpdate.id;
		}).nodeify(cb);
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
};

Topic.create = function (request, topicMeta, receiverKeys, cb) {
	var User = require("./user.js");

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

	pushAPI.updateBadgeForUser(userID);
});

module.exports = Topic;
