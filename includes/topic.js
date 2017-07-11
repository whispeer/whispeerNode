"use strict";

var h = require("whispeerHelper");

var client = require("./redisClient");

var config = require("./configManager").get();

var pushAPI = require("./pushAPI");

var base = "db:" + (config.db.number || 0) + ":observer:user:";
client.psub(base + "*:topicRead", function (channel) {
	var userID = h.parseDecimal(channel.substr(base.length).replace(":topicRead", ""));

	pushAPI.updateBadgeForUser(userID);
});
