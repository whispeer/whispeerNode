"use strict";

var step = require("step");
var h = require("./helper");

var view = function view(socket, session) {
	var theView = this;
	this.getSocket = function getSocketF() {
		return socket;
	};

	this.getSession = function getSessionF() {
		return session;
	};

	this.getUserID = function getUserIDF() {
		return session.getUserID();
	};

	this.getOwnUser = function getOwnUserF(cb) {
		step(function () {
			theView.logedinError(this);
		}, h.sF(function () {
			var User = require("./user.js");
			User.getUser(this.getUserID(), this);
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