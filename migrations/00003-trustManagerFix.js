"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function renameForUser(uid, m, cb) {
	step(function () {
		this.parallel.unflatten();

		client.exists("user:" + uid + ":undefined", this.parallel());
		client.exists("user:" + uid + ":trustManager", this.parallel());
	}, h.sF(function (exists1, exists2) {
		if (exists1 === 1 && exists2 === 0) {
			console.log("rename", "user:" + uid + ":undefined", "user:" + uid + ":trustManager");
			m.rename("user:" + uid + ":undefined", "user:" + uid + ":trustManager");
			this.ne();
		} else {
			this.ne();
		}
	}), cb);
}

function fixTrustManagerStorage(cb) {
	var multi = client.multi();

	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (users) {
		users.forEach(function (uid) {
			renameForUser(uid, multi, this.parallel());
		}, this);
	}), h.sF(function () {
		multi.exec(this);
	}), cb);
}

module.exports = fixTrustManagerStorage;