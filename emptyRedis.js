"use strict";
var client = require("./includes/redisClient");

client.flushdb(function (e) {
	if (e) {
		console.error("did not empty database!");
	} else {
		console.log("done");
	}
	process.exit();
});