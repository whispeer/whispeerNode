"use strict";
var client = require("./includes/redisClient");

var fs = require("fs");
var path = require("path");

var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "config.json")));

var stdin = process.openStdin();
//require("tty").setRawMode(true);

console.log("Deleting all data in db number " + config.dbNumber || 0);
console.log("Press y and enter to continue!");

stdin.on("data", function(chunk) {
	if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
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
	} else {
		console.log("Aborted!");
		process.exit(-1);
	}
});