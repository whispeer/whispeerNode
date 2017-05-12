#!/usr/bin/env node

/*process.on("uncaughtException", function (err) {
    console.error("An uncaughtException was found, the program will end.");
    //hopefully do some logging.

	console.error(err);

    process.exit(1);
});*/

"use strict";

const fs = require("fs");
const configManager = require("./includes/configManager");
const config = configManager.get();

const express = require("express")();
const expressHandlers = require("./includes/expressHandlers");

const setup = require("./includes/setup");

const Bluebird = require("bluebird")

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

if (config.https) {
	server = require("https").createServer(options, express);
} else {
	server = require("http").createServer(express);
}

const io = require("socket.io")(server);

require("./includes/errors");

const setupErrorMails = require("./includes/errorMails")

const client = require("./includes/redisClient");

var onSocketConnection = require("./onSocketConnection");

const removeUserSockets = (users) => {
	return Bluebird.resolve(users).map((user) => {
		return client.delAsync("user:" + user + ":sockets");
	})
}

const deleteOnlineUsers = (onlineUsers) => {
	console.log("User Sockets Removed from " + onlineUsers.length + " users");

	return Bluebird.all([
		client.delAsync("user:online"),
		removeUserSockets(onlineUsers)
	])
}


return require("check-dependencies")({}).then((dependencyCheck) => {
	if (!dependencyCheck.depsWereOk) {
		console.error("Dependencies not satisfied!");

		console.error(dependencyCheck.error);

		process.exit(5)
		return;
	}

	return setup();
}).then(() => {
	return client.smembersAsync("user:online");

	setupErrorMails()
}).then((onlineUsers) => {
	return deleteOnlineUsers(onlineUsers)
}).then(() => {
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
});

console.log("App started");
