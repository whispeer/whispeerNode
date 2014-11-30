#!/usr/bin/env node

"use strict";

var invites = require("./includes/invites");

var viewStub = {
	logedinError: function (cb) { cb(); },
	getUserID: function () { return -1; }
};

var configManager = require("./includes/configManager");
var config = configManager.get();
var client = require("./includes/redisClient");

client.select(config.dbNumber || 0, function (e) {
	if (e) {
		throw e;
	}
	console.log("Database selected: " + config.dbNumber || 0);

	invites.generateCode(viewStub, function (e, c) {
		if (e) {
			throw e;
		}

		console.log(c);
		process.exit();
	});
});
