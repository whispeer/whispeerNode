"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

var search = require("../includes/search");

function updateUserNicknames(cb) {
	var userids, m = client.multi();

	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (_userids) {
		userids = _userids;
		userids.forEach(function (userid) {
			client.hget("user:" + userid, "signKey", this.parallel());
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

				//search.user.remove(user.id, this.parallel());
			}
		}, this);

		//m.exec(this);
	}), cb);
}

module.exports = updateUserNicknames;
