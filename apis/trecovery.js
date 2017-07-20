"use strict";

var step = require("step");
var h = require("whispeerHelper");

var User = require("../includes/user");

var client = require("../includes/redisClient");

var trecovery = {
	request: function (data, fn, request) {
		step(function () {
			User.getUser(data.identifier, this);
		}, h.sF(function (user) {
			user.requestRecovery(request, this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	},
	useRecoveryCode: function (data, fn, request) {
		step(function () {
			client.get("recovery:" + data.code, this);
		}, h.sF(function (userID) {
			if (userID) {
				User.getUser(userID, this);
			} else {
				throw new Error("code was already used");
			}
		}), h.sF(function (user) {
			user.useRecoveryCode(request, data.code, data.keyFingerPrint, this);
		}), fn);
	}
};

trecovery.request.noLoginNeeded = true;
trecovery.useRecoveryCode.noLoginNeeded = true;

module.exports = trecovery;