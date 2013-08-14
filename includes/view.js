"use strict";

var step = require("step");
var h = require("whispeerHelper");
var client = require("./redisClient");

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

	session.changeListener(function sessionChange() {
		step(function () {
			theView.destroy();

			session.logedin(this);
		}, h.sF(function (logedin) {
			if (logedin) {
				var base = "user:" + session.getUserID() + ":*";
				theView.psub(base, function (channel, data) {
					var subChannel = channel.substr(base.length - 1);

					if (listener[subChannel]) {
						listener[subChannel](theView, data);
					}
				});
			}
		}), function (e) {
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
				if (session.getUserID() !== user.getID()) {
					throw new AccessViolation();
				}
			} else if (typeof user === "string") {
				if (session.getUserID() !== parseInt(user, 10)) {
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
};

module.exports = view;