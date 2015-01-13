"use strict";

var step = require("step");
var h = require("whispeerHelper");

var User = require("../includes/user");

var trecovery = {
	request: function getTopicF(data, fn) {
		step(function () {
			User.getUser(data.identifier, this);
		}, h.sF(function (user) {
			user.requestRecovery(this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	}
};

trecovery.request.noLoginNeeded = true;

module.exports = trecovery;