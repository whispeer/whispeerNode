#!/usr/bin/env node

"use strict";

var util = require("util");
var invites = require("./includes/invites");

global.requestStub = {
	session: {
		logedinError: function (cb) { cb(); },
		getUserID: function () { return -1; }
	}
};


var configManager = require("./includes/configManager");
var config = configManager.get();
var client = require("./includes/redisClient");

client.select(config.db.number || 0, function (e) {

	if (e) {
		throw e;
	}

	util.error(util.format("Database selected: %d", config.db.number || 0));

	invites.generateCode(requestStub, function (e, c) {
		if (e) {
			throw e;
		}

		util.puts(c);
		process.exit();
	});
});
