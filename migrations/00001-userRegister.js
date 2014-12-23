"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function addUserRegisteredList(cb) {
	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (userids) {

		userids.forEach(function (userid) {
			client.zadd("user:registered", new Date().getTime(), userid, this.parallel());
		}, this);
	}), h.sF(function () {
		this.ne(true);
	}), cb);
}

module.exports = addUserRegisteredList;