
"use strict";

var client = require("./redisClient");

var onlineStatusUpdater = require("./onlineStatus");
var errorService = require("./errorService");
var step = require("step");
var h = require("whispeerHelper");

var socketS = require("socket.io-stream");

function SocketData(socket, session) {
	this.session = session;
	this.socket = socket;

	var theSocketData = this, streamSocket;

	var psubs = {};
	var subs = {};

	var closeSubscribers = [];

	theSocketData.once("disconnect", function () {
		console.log("removing subscribers");
		closeSubscribers.forEach(function (closeSubscriber) {
			try {
				closeSubscriber();
			} catch (e) {
				errorService.handleError(e);
			}
		});

		closeSubscribers = [];
	});

	this.isConnected = function () {
		return socket.connected;
	};

	/* helper functions. Please use redisObserver where possible */
	this.psub = function (channel, cb) {
		if (!psubs[channel]) {
			psubs[channel] = true;

			closeSubscribers.push(client.psub(channel, cb));
		}
	};

	this.sub = function (channel, cb) {
		if (!subs[channel]) {
			subs[channel] = true;

			closeSubscribers.push(client.sub(channel, cb));
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
		step(function () {
			theSocketData.session.getOwnUser(this);
		}, h.sF(function (me) {
			me.notify(channel, message);
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
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
