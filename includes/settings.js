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
			client.get("user:" + view.session.getUserID() + ":settings", this);
		}, h.sF(function (result) {
			this.ne(JSON.parse(result));
		}), cb);
	},
	setOwnSettings: function (view, settings, cb) {
		step(function () {
			client.set("user:" + view.session.getUserID() + ":settings", JSON.stringify(settings), this);
		}, h.sF(function (res) {
			this.ne(res === "OK");
		}), cb);
	}
};

module.exports = settings;