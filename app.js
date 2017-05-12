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
		ca: fs.readFileSync(config.https.caPath),
		ciphers: "EDH+CAMELLIA:EDH+aRSA:EECDH+aRSA+AESGCM:EECDH+aRSA+SHA384:EECDH+aRSA+SHA256:EECDH:+CAMELLIA256:+AES256:+CAMELLIA128:+AES128:+SSLv3:!aNULL:!eNULL:!LOW:!3DES:!MD5:!EXP:!PSK:!DSS:!RC4:!SEED:!ECDSA:CAMELLIA256-SHA:AES256-SHA:CAMELLIA128-SHA:AES128-SHA",
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

const setupErrorMails = require("./includes/errorMails")

var step = require("step");
var h = require("whispeerHelper");
var client = require("./includes/redisClient");

var onSocketConnection = require("./onSocketConnection");

step(function () {
	require("check-dependencies")({}, this.ne);
}, h.sF(function (dependencyCheck) {
	if (!dependencyCheck.depsWereOk) {
		console.error("Dependencies not satisfied!");

		console.error(dependencyCheck.error);

		process.exit(5)
		return;
	}

	setup(this);
}), h.sF(function () {
	client.smembers("user:online", this);

	setupErrorMails()
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
