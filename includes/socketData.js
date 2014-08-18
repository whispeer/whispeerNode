
"use strict";

var client = require("./redisClient");

var onlineStatusUpdater = require("./onlineStatus");

var socketS = require("socket.io-stream");

function SocketData(socket, session) {
	this.session = session;
	this.socket = socket;

	var theSocketData = this, streamSocket;

	var psubs = {};
	var subs = {};

	/* helper functions. Please use redisObserver where possible */
	this.psub = function (channel, cb) {
		if (!psubs[channel]) {
			psubs[channel] = true;

			var closeSubscriber = client.psub(channel, cb);
			socket.once("disconnect", closeSubscriber);
		}
	};

	this.sub = function (channel, cb) {
		if (!subs[channel]) {
			subs[channel] = true;

			var closeSubscriber = client.sub(channel, cb);
			socket.once("disconnect", closeSubscriber);
		}
	};

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

	this.notifyOwnClients = function (channel, message) {
		message = JSON.stringify(message);
		client.publish("user:" + theSocketData.session.getUserID() + ":" + channel, message);
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