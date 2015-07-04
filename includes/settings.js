"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");

/*
	Settings: {
		data: encryptedObject
	}

*/

var settings = {
	getOwnSettings: function (request, cb) {
		step(function () {
			client.get("user:" + request.session.getUserID() + ":settings", this);
		}, h.sF(function (result) {
			this.ne(JSON.parse(result));
		}), cb);
	},
	setOwnSettings: function (request, settings, cb) {
		step(function () {
			client.set("user:" + request.session.getUserID() + ":settings", JSON.stringify(settings), this);
		}, h.sF(function (res) {
			this.ne(res === "OK");
		}), cb);
	}
};

module.exports = settings;
