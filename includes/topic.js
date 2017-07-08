"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");

var mailer = require("./mailer");

var config = require("./configManager").get();

var pushAPI = require("./pushAPI");

var Topic = function (id) {
	/** add a message to this topic */
	this.addMessage = function addMessageF(request, message, cb) {
		var theReceiver, sender;
		step(function () {
			mailer.sendInteractionMails(theReceiver, "message", "new", {
				sender: sender,
				interactionID: id
			});

			this.ne(true);
		}, cb);
	};
};

var base = "db:" + (config.db.number || 0) + ":observer:user:";
client.psub(base + "*:topicRead", function (channel) {
	var userID = h.parseDecimal(channel.substr(base.length).replace(":topicRead", ""));

	pushAPI.updateBadgeForUser(userID);
});

module.exports = Topic;
