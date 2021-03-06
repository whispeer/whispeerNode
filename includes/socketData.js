
"use strict";

const client = require("./redisClient");

const OnlineStatusUpdater = require("./onlineStatus");
const errorService = require("./errorService");

const Bluebird = require("bluebird")

function SocketData(socket, session) {
	this.session = session;
	this.socket = socket;

	var theSocketData = this, streamSocket;

	var psubs = {};
	var subs = {};

	var closeSubscribers = [];

	let version

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

	this.setVersion = (_version) => {
		version = _version
	}

	this.getVersion = () => version

	this.getShortIP = function () {
		var address = socket.handshake.address, ipV4;

		var lastDouble = address.lastIndexOf(":");
		var lastSingle = address.lastIndexOf(".");

		if (lastSingle > -1 && lastDouble > -1) {
			ipV4 = address.substr(lastDouble + 1, lastSingle);
		} else if (lastDouble === -1) {
			ipV4 = address;
		} else {
			return "ipV6";
		}

		var splittedAddress = ipV4.split(".");
		splittedAddress.pop();

		var shortIP = splittedAddress.join(".") + ".0";

		return shortIP;
	};

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

	this.notifyOwnClients = function (channel, message) {
		return theSocketData.session.getOwnUser().then((me) => {
			me.notify(channel, message)
		}).catch((e) => console.error(e))
	}

	var statusUpdater = new OnlineStatusUpdater(this, session);

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
			return Bluebird.resolve().nodeify(cb);
		},
		logedin: function (cb) {
			return Bluebird.resolve(true).nodeify(cb);
		},
		logedinError: function (cb) {
			return Bluebird.resolve().nodeify(cb);
		}
	}
};

module.exports = SocketData;
