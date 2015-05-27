"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

var search = require("../includes/search");

function updateUserNicknames(cb) {
	var userids;

	step(function () {
		client.keys("search:user:id:*", this);
	}, h.sF(function (_userids) {
		userids = _userids.map(function (uid) {
			return uid.split(":").pop();
		});

		userids.forEach(function (userid) {
			client.get("user:id:" + userid, this.parallel());
		}, this);
	}), h.sF(function (useridsChecked) {
		userids.filter(function (uid, i) {
			return !useridsChecked[i];
		}).forEach(function (userid) {
			search.user.remove(userid, this.parallel());
		}, this);
	}), cb);
}

module.exports = updateUserNicknames;
