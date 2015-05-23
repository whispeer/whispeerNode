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
		var nicknamesToDelete = nicknames.slice(0);
		var nicknamesOldFormat = [];

		nicknames.forEach(function (nickname, i) {
			if (!nickname) {
				console.log("no nickname for " + userids[i]);
				return;
			}

			var nick = nickname.toLowerCase();

			if (!nicknamesHashMap[nick]) {
				nicknamesHashMap[nick] = {
					id: userids[i],
					original: nickname
				};
			} else {
				nicknamesOldFormat.push({
					nick: nickname,
					id: userids[i]
				});

				if (nicknamesHashMap[nick].id !== -1) {
					nicknamesOldFormat.push({
						nick: nicknamesHashMap[nick].original,
						id: nicknamesHashMap[nick].id
					});
				}

				nicknamesHashMap[nick] = {
					id: -1
				};

				console.log("duplicate nick :( " + nick + " - " + userids[i] + " - " + nicknamesHashMap[nick]);
			}
		});

		var nicknamesToChange = Object.keys(nicknamesHashMap).map(function (nick) {
			return {
				nick: nick,
				id: nicknamesHashMap[nick].id
			};
		});

		var m = client.multi();

		nicknamesToDelete.forEach(function (nickname) {
			m.del("user:nickname:" + nickname);
		});

		nicknamesToChange.forEach(function (nickname) {
			m.set("user:nickname:" + nickname.nick, nickname.id);
		});

		nicknamesOldFormat.forEach(function (nickname) {
			m.set("user:nickname:old:" + nickname.nick, nickname.id);
		});

		console.log(nicknamesToChange);
		console.log(nicknamesOldFormat);

		m.exec(this);
	}), cb);
}

module.exports = updateUserNicknames;
