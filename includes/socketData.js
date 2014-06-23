
"use strict";

var client = require("./redisClient");

var onlineStatusUpdater = require("./onlineStatus");

var socketS = require("socket.io-stream");

function SocketData(socket, session) {
	this.session = session;
	this.socket = socket;

	var theSocketData = this, streamSocket;

	this.upgradeStream = function (api) {
		if (!streamSocket) {
			streamSocket = socketS(socket);

			var attr;
			for (attr in api) {
				if (api.hasOwnProperty(attr)) {
					streamSocket.on(attr, api[attr]);
				}
			}
		}
	};

	this.sub = function subF(channel, cb) {
		var end = client.sub(channel, function (message) {
			cb(message);
		});

		theSocketData.once("disconnect", end);
	};

	this.notifyOwnClients = function (channel, message) {
		message = JSON.stringify(message);
		client.publish("user:" + theSocketData.session.getUserID() + ":" + channel, message);
	};

	this.psub = function subF(channel, cb) {
		var end = client.psub(channel, function (channel, message) {
			var base = "user:" + theSocketData.session.getUserID() + ":";

			if (channel.substring(0, base.length) === base) {
				cb(channel, message);
			}
		});

		theSocketData.once("disconnect", end);
	};

	var statusUpdater = new onlineStatusUpdater(this, session);

	this.recentActivity = function (cb) {
		statusUpdater.recentActivity(cb);
	};
}

var util = require("util");
var EventEmitter = require("events").EventEmitter;
util.inherits(SocketData, EventEmitter);

SocketData.logedinStub = {
	session: {
		ownUserError: function (user, cb) {
			cb();
		},
		logedin: function (cb) {
			cb(null, true);
		},
		logedinError: function (cb) {
			cb();
		}
	}
};

module.exports = SocketData;