"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");

/*
	Settings: {
		data: encryptedObject
	}

*/

function SimpleUserDataStore(name) {
	this._name = name;
}

SimpleUserDataStore.prototype.get = function (request, cb) {
	step(function () {
		client.get("user:" + request.session.getUserID() + ":" + this._name, this);
	}, h.sF(function (result) {
		this.ne(JSON.parse(result));
	}), cb);
};

SimpleUserDataStore.prototype.set = function (request, newContent, cb) {
	step(function () {
		client.set("user:" + request.session.getUserID() + ":" + this._name, JSON.stringify(newContent), this);
	}, h.sF(function (res) {
		this.ne(res === "OK");
	}), cb);
};

module.exports = SimpleUserDataStore;