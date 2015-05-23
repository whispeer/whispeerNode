"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function updateUserNicknames(cb) {
	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (userids) {
		userids.forEach(function (userid) {
			client.hget("user:" + userid, "nickname", this.parallel());
		}, this);
	}), h.sF(function (nicknames) {
		var nicknamesHashMap = {};
		nicknames.forEach(function (nickname) {
			var nick = nickname.toLowerCase();

			if (!nicknamesHashMap[nick]) {
				nicknamesHashMap[nick] = 1;
			} else {
				console.log("duplicate nick :( " + nick);
			}
		});
		return;
	}), cb);
}

module.exports = updateUserNicknames;
