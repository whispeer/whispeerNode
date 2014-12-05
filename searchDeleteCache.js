#!/usr/bin/env node

"use strict";

global.requestStub = {
	session: {
		logedinError: function (cb) { cb(); },
		getUserID: function () { return -1; }
	}
};

var setup = require("./includes/setup");
var step = require("step");
var client = require("./includes/redisClient");
var h = require("whispeerHelper");

step(function () {
	setup(this);
}, h.sF(function () {
	client.keys("search:user:search:*", this);
}), h.sF(function (toDelete) {
	toDelete.push(this);
	if (toDelete.length > 0) {
		client.del.apply(client, toDelete, this);
	} else {
		this.ne();
	}
}), h.sF(function () {
	process.exit();
}));