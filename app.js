#!/usr/bin/env node

/*process.on("uncaughtException", function (err) {
    console.error("An uncaughtException was found, the program will end.");
    //hopefully do some logging.

	console.error(err);

    process.exit(1);
});*/

"use strict";

var fs = require("fs");
var configManager = require("./includes/configManager");
var config = configManager.get();

var options = {};

if (config.https) {
	options = {
		key: fs.readFileSync(config.https.keyPath),
		cert: fs.readFileSync(config.https.certPath),
		ca: fs.readFileSync(config.https.caPath)
	};
}

var io = require("socket.io").listen(config.wsPort, options);
console.log("Listening on port " + config.wsPort);

if (!config.debug) {
	io.set("log level", 1);
} else {
	console.log("Verbose Mode started!");
}

if (config.production) {
	console.log("Production Mode started!");
	io.disable("browser client");
	io.set("flash policy port", config.wsPort);
	io.set("transports", ["websocket", "flashsocket", "htmlfile", "xhr-polling"]);
} else {
	console.log("Dev Mode started!");
	io.set("transports", ["websocket"]);
}

require("./includes/errors");

var step = require("step");
var h = require("whispeerHelper");
var client = require("./includes/redisClient");

var onSocketConnection = require("./onSocketConnection");

step(function () {
	console.log("Database selected: " + config.dbNumber || 0);
	client.select(config.dbNumber || 0, this);
}, h.sF(function () {
	client.smembers("user:online", this);
}), h.sF(function (onlineUsers) {
	console.log("User Sockets Removed from " + onlineUsers.length + " users");

	var i;
	for (i = 0; i < onlineUsers.length; i += 1) {
		client.del("user:" + onlineUsers[i] + ":sockets", this.parallel());
	}

	client.del("user:online", this.parallel());
}), h.sF(function () {
	io.sockets.on("connection", onSocketConnection);
}));

console.log("App started");

