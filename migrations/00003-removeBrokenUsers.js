"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function updateUserNicknames(cb) {
	var userids, m = client.multi();

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
			if (h.parseDecimal(user.id) > 0) {
				console.log("removing user: " + user.id);
				m.srem("user:list", user.id, this);
				m.del("user:id:" + user.id);
			}
		});

		m.exec(this);
	}), cb);
}

module.exports = updateUserNicknames;
