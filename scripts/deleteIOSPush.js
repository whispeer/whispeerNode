#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
var requireConfirmation = Bluebird.promisify(function(message, action) {
	console.log(message);
	if (process.stdout.isTTY) {
		var stdin = process.openStdin();
		console.log("Press y and enter to continue!");

		stdin.on("data", function(chunk) {
			if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
				action();
			} else {
				console.log("Aborted!");
				process.exit(-1);
			}
		});
	} else {
		action();
	}
});

requireConfirmation("Really delete all IOS Push Tokens?").then(function () {
	return setupP();
}).then(function () {
	return require("../includes/models/waterlineLoader");
}).then(function (ontology) {
	var pushToken = ontology.collections.pushtoken;

	return pushToken.find({ where: { deviceType: "ios" }}).then(function (dbEntries) {
		if (dbEntries.length === 0) {
			return;
		}

		var tokens = dbEntries.map(function (deviceInfo) {
			return deviceInfo.tokens;
		});

		console.info("removing ios devices from database: " + JSON.stringify(tokens));

		return pushToken.destroy({ token: tokens });
	});
}).then(function () {
	process.exit();
});
