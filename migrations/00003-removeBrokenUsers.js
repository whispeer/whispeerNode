"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function deleteUser(id, cb) {
	if (h.parseDecimal(id) > 0) {
		console.log(id);
		step(function () {
			client.keys("user:" + id, this);
		}, h.sF(function (keys) {
			console.log(keys);
		}));
	} else {
		console.log("that is not an id: " + id);
		cb();
	}
}

function updateUserNicknames(cb) {
	var userids;

	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (_userids) {
		userids = _userids;
		userids.forEach(function (userid) {
			client.hget("user:" + userid, "nickname", this.parallel());
		}, this);
	}), h.sF(function (nicknames) {
		nicknames.map(function (nickname, i) {
			return {
				nickname: nickname,
				id: userids[i]
			};
		}).filter(function (user) {
			return !user.nickname;
		}).forEach(function (user) {
			deleteUser(user.id, this.parallel());
		}, this);
	}), cb);
}

module.exports = updateUserNicknames;
