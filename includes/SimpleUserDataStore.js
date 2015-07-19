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
	var that = this;
	step(function () {
		client.get("user:" + request.session.getUserID() + ":" + that._name, this);
	}, h.sF(function (result) {
		this.ne(JSON.parse(result));
	}), cb);
};

SimpleUserDataStore.prototype.set = function (request, newContent, cb) {
	var that = this;
	step(function () {
		if (that._preSet) {
			that._preSet(request, newContent, this);
		} else {
			this.ne();
		}
	}, h.sF(function () {
		client.set("user:" + request.session.getUserID() + ":" + that._name, JSON.stringify(newContent), this);
	}), h.sF(function (res) {
		request.session.getOwnUser(function (e, user) {
			if (!e) {
				user.notify(that._name, newContent);
			}
		});

		if (res === "OK") {
			this.ne(true);
		} else {
			this.ne(false);
		}
	}), cb);
};

SimpleUserDataStore.prototype.preSet = function (fn) {
	this._preSet = fn;
};

SimpleUserDataStore.prototype.apiGet = function (data, fn, request) {
	this.get(request, h.objectifyResult("content", fn));
};

SimpleUserDataStore.prototype.apiSet = function (data, fn, request) {
	this.set(request, data.content, h.objectifyResult("success", fn));
};


module.exports = SimpleUserDataStore;
