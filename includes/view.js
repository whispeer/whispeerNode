"use strict";

var step = require("step");
var h = require("./helper");

require("./errors");

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

	this.ownUserError = function ownUserErrorF(user, cb) {
		step(function () {
			if (!user.isSaved()) {
				this.last.ne();
			}

			theView.logedinError(this);
		}, h.sF(function () {
			if (session.getUserID() === user.getUserID()) {
				this.ne();
			} else {
				throw new AccessViolation();
			}
		}), cb);
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