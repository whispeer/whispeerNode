/*process.on("uncaughtException", function (err) {
    console.error("An uncaughtException was found, the program will end.");
    //hopefully do some logging.

	console.error(err);

    process.exit(1);
});*/

"use strict";

var io = require("socket.io").listen(3000);

io.configure("production", function(){
	console.log("Production Mode started!");
	io.disable("browser client");
	io.set("log level", 1);

	io.set("transports", ["websocket", "flashsocket", "htmlfile", "xhr-polling"]);
});

io.configure("development", function(){
	console.log("Dev Mode started!");
	io.set("transports", ["websocket"]);
});

require("./includes/errors");

var step = require("step");
var h = require("whispeerHelper");
var client = require("./includes/redisClient");

var onSocketConnection = require("./onSocketConnection");

step(function () {
	client.smembers("user:online", this);
}, h.sF(function (onlineUsers) {
	console.log("User Sockets Removed from " + onlineUsers.length + " users");

	var i;
	for (i = 0; i < onlineUsers.length; i += 1) {
		client.del("user:" + onlineUsers[i] + ":sockets", this.parallel());
	}

	client.del("user:online", this.parallel());
}), h.sF(function () {
	io.sockets.on("connection", onSocketConnection);
}));