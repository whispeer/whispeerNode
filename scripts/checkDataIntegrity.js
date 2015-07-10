#!/usr/bin/env node

"use strict";

var util = require("util");
var User = require("../includes/user");

global.requestStub = {
	session: {
		logedinError: function (cb) { cb(); },
		getUserID: function () { return -1; }
	}
};


var configManager = require("../includes/configManager");
var config = configManager.get();
var client = require("../includes/redisClient");

require("../includes/errors");

client.select(config.db.number || 0, function (e) {

	if (e) {
		throw e;
	}

	util.error(util.format("Database selected: %d", config.db.number || 0));

	var errors = [];

	User.check(errors, function (e) {
		if (e) {
			console.error(e);
		}

		if (errors.length === 0) {
			console.log("no errors found!");
		} else {
			errors.forEach(function (e) {
				console.log(e);
				if (e.stack) {
					console.log(e.stack);
				}
				console.log("=================");
			});
		}

		process.exit();
	});
});
