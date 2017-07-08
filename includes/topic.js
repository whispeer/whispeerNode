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

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	var mDomain = domain + ":messages";

	/** add a message to this topic */
	this.addMessage = function addMessageF(request, message, cb) {
		var theReceiver, theSender, messageID;
		step(function () {
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
				user.notify("message", messageID);
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

var base = "db:" + (config.db.number || 0) + ":observer:user:";
client.psub(base + "*:topicRead", function (channel) {
	var userID = h.parseDecimal(channel.substr(base.length).replace(":topicRead", ""));

	pushAPI.updateBadgeForUser(userID);
});

module.exports = Topic;
