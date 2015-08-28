#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);
var client = require("../includes/redisClient");

var userID = parseInt(process.argv[2], 10);

if (userID < 1 || !userID) {
	console.log("Invalid user id");
	process.exit(-1);
}

setupP().then(function () {
	return client.keysAsync("analytics:registration:id:*:user");
}).filter(function (key) {
	return client.sismemberAsync(key, userID);
}).map(function (key) {
	return key.split(":")[3];
}).then(console.log).then(function () {
	process.exit();
});
