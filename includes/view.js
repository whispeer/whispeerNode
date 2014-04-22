"use strict";

var step = require("step");
var h = require("whispeerHelper");
var client = require("./redisClient");

var onlineStatusUpdater = require("./onlineStatus");

var view = function view(socket, session, listener) {
	var theView = this, toDestroy = [];

	this.getSocket = function getSocketF() {
		return socket;
	};

	function getSessionF() {
		return session;
	}

	this.getSession = getSessionF;

	this.session = getSessionF;

	session.changeListener(function sessionChange(logedin) {
		step(function () {
			theView.destroy();

			if (logedin) {
				var base = "user:" + session.getUserID() + ":*";
				theView.psub(base, function (channel, data) {
					var subChannel = channel.substr(base.length - 1);

					if (listener[subChannel]) {
						listener[subChannel](theView, data);
					} else {
						theView.getSocket().emit("notify." + subChannel, JSON.parse(data));
					}
				});
			}
		}, function (e) {
			console.error(e);
		});
	});

	this.getUserID = function getUserIDF() {
		return session.getUserID();
	};

	this.addToDestroy = function addToDestroyF(func) {
		toDestroy.push(func);
	};

	this.destroy = function doDestroy() {
		var i;
		for (i = 0; i < toDestroy.length; i += 1) {
			try {
				toDestroy[i]();
			} catch (e) {
				console.error(e);
			}
		}
	};

	this.sub = function subF(channel, cb) {
		var end = client.sub(channel, function (message) {
			cb(message);
		});

		theView.addToDestroy(end);
	};

	this.notifyOwnClients = function (channel, message) {
		message = JSON.stringify(message);
		client.publish("user:" + theView.getUserID() + ":" + channel, message);
	};

	this.psub = function subF(channel, cb) {
		var end = client.psub(channel, function (channel, message) {
			var base = "user:" + theView.getUserID();

			if (channel.substring(0, base.length + 1) === base + ":") {
				cb(channel, message);
			}
		});

		theView.addToDestroy(end);
	};

	this.getOwnUser = function getOwnUserF(cb) {
		step(function () {
			theView.logedinError(this);
		}, h.sF(function () {
			var User = require("./user.js");
			User.getUser(theView.getUserID(), this);
		}), cb);
	};

	this.ownUserError = function ownUserErrorF(user, cb) {
		step(function () {
			if (typeof user === "object" && !user.isSaved()) {
				this.last.ne();
			}

			theView.logedinError(this);
		}, h.sF(function () {
			if (typeof user === "object") {
				if (parseInt(session.getUserID(), 10) !== parseInt(user.getID(), 10)) {
					throw new AccessViolation();
				}
			} else if (typeof user === "string") {
				if (parseInt(session.getUserID(), 10) !== parseInt(user, 10)) {
					console.log(session.getUserID() + "-" + parseInt(user, 10));
					throw new AccessViolation();
				}
			} else if (typeof user === "number") {
				if (session.getUserID() !== user) {
					throw new AccessViolation();
				}
			} else {
				throw new AccessViolation();
			}

			this.ne();
		}), cb);
	};

	this.logout = function (cb) {
		step(function () {
			session.logout(this);
		}, cb);
	};

	this.logedin = function (cb) {
		step(function () {
			session.logedin(this);
		}, cb);
	};

	this.logedinError = function logedinErrorF(cb) {
		step(function () {
			session.logedin(this);
		}, h.sF(function (logedin) {
			if (!logedin) {
				throw new NotLogedin();
			} else {
				this.ne();
			}
		}), cb);
	};

	var statusUpdater = new onlineStatusUpdater(this, session);

	this.recentActivity = function (cb) {
		statusUpdater.recentActivity(cb);
	};
};

view.logedinViewStub = {
	ownUserError: function (user, cb) {
		cb();
	},
	logedin: function (cb) {
		cb(null, true);
	},
	logedinError: function (cb) {
		cb();
	}
};

module.exports = view;