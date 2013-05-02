"use strict";

var step = require("step");

var User = function () {

};

User.getUser = function (identifier, callback) {
	step(function () {
		throw new UserNotExisting(identifier);
	}, callback);
};

module.exports = User;