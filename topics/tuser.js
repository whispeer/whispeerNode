"use strict";

var step = require("step");
var h = require("whispeerHelper");

var u = {
	get: function getUserF(data, fn, view) {
		step(function () {
			if (data && data.identifier) {
				var User = require("../includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, theUser) {
			if (e) {
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				theUser.getUData(view, this);
			}
		}, UserNotExisting), fn);
	},
	own: function getOwnDataF(data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getUData(view, this);
		}), fn);
	}
};

module.exports = u;