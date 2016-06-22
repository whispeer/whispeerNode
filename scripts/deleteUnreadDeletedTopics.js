#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

setupP().then(function () {
	return client.smembersAsync("user:list");
}).map(function (userid) {
	return client.zrangeAsync("topic:user:" + userid + ":unreadTopics", 0, -1).map(function (topicID) {
		return client.zrankAsync("topic:user:" + userid + ":topics", topicID).then(function (exists) {
			if (exists === null) {
				console.log("Removed topic from unread list (" + userid + "): " + topicID);
				return client.zremAsync("topic:user:" + userid + ":unreadTopics", topicID);
			}
		});
	});
}).then(function () {
	process.exit();
});
