"use strict";

var client = require("./includes/redisClient");

var configManager = require("./includes/configManager");
var config = configManager.get();

// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
var requireConfirmation = function(message, action) {
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
};

var emptyRedis = function() {

	client.select(config.dbNumber || 0, function () {
		client.flushdb(function (e) {
			if (e) {
				console.error("Error! Database was not flushed!");
			} else {
				console.log("Database Number " + (config.dbNumber || 0) + " successfully emptied!");
			}
			process.exit();
		});
	});

};

requireConfirmation("Deleting all data in db number " + config.dbNumber || 0, emptyRedis);
