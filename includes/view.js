"use strict";

var step = require("step");
var h = require("./helper");

require("./errors");

var view = function view(socket, session) {
	this.getSocket = function getSocketF() {
		return socket;
	};

	this.getSession = function getSessionF() {
		return session;
	};

	this.getUserID = function getUserIDF() {
		//TODO
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