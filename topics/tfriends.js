"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Friends = require("../includes/friends");

var f = {
	add: function addFriend(data, fn, view) {
		/*
			userid,
			fkdecryptor, //is added to our friend key
			signedRequest //signature of "friendShip:userid:nickname"
		*/
		step(function () {
			Friends.add(view, data.userid, data.signedRequest, this);
		}, h.sF(function () {
			Friends.getFriendsKey().addDecryptor(data.fkdecryptor);
		}), fn);
	},
	mutual: function getMutualF(data, fn, view) {
		step(function () {
			Friends.myMutual(view, data.uid, this);
		}, h.sF(function (ids) {
			this.last.ne({
				mutual: ids
			});
		}), fn);
	},
	getAll: function getFriends(data, fn, view) {
		step(function () {
			Friends.getRequests(view, this.parallel());
			Friends.getRequested(view, this.parallel());
			Friends.getAll(view, this.parallel());
		}, fn);
	}
};

module.exports = f;