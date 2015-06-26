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

var setup = require("./includes/setup");

var options = {};

if (config.https) {
	options = {
		key: fs.readFileSync(config.https.keyPath),
		cert: fs.readFileSync(config.https.certPath),
		ca: fs.readFileSync(config.https.caPath)
	};
}

var server;

var express = require("express")();
var expressHandlers = require("./includes/expressHandlers");

if (config.https) {
	server = require("https").createServer(options, express);
} else {
	server = require("http").createServer(express);
}

var io = require("socket.io")(server);

require("./includes/errors");

var step = require("step");
var h = require("whispeerHelper");
var client = require("./includes/redisClient");

var onSocketConnection = require("./onSocketConnection");

step(function () {
	setup(this);
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
	io.on("connection", onSocketConnection);
	expressHandlers(express, client);

	server.listen(config.wsPort);

	if (config.production) {
		console.log("Production Mode started!");
		//io.disable("browser client");
		io.set("transports", ["websocket", "flashsocket", "htmlfile", "xhr-polling", "polling"]);
	} else {
		console.log("Dev Mode started!");
		io.set("transports", ["websocket", "polling"]);
	}
}));

console.log("App started");

