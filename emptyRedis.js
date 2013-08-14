"use strict";
var client = require("./includes/redisClient");

client.flushdb(function () {
	console.log("done");
	process.exit();
});