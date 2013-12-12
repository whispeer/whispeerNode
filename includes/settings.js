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
	getOwnSettings: function (view, cb) {
		step(function () {
			client.get("user:" + view.getUserID() + ":settings", this);
		}, h.sF(function (result) {
			this.ne(JSON.parse(result));
		}), cb);
	},
	setOwnSettings: function (view, settings, cb) {
		step(function () {
			client.set("user:" + view.getUserID() + ":settings", JSON.stringify(settings), this);
		}, cb);
	}
};

module.exports = settings;