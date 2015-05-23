"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

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
		var nicknamesHashMap = {};
		nicknames.forEach(function (nickname, i) {
			if (!nickname) {
				console.log("no nickname for " + userids[i]);
				return;
			}

			var nick = nickname.toLowerCase();

			if (!nicknamesHashMap[nick]) {
				nicknamesHashMap[nick] = 1;
			} else {
				console.log("duplicate nick :( " + nick + " - " + userids[i]);
			}
		});
		return;
	}), cb);
}

module.exports = updateUserNicknames;
