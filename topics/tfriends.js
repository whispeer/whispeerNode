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
			Friends.add(view, data.userid, data.signedRequest, data.key, data.decryptors, this);
		}, h.sF(function (success) {
			this.ne({
				friendAdded: success
			});
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
			this.parallel.unflatten();

			Friends.getRequests(view, this.parallel());
			Friends.getRequested(view, this.parallel());
			Friends.get(view, this.parallel());
		}, h.sF(function (requests, requested, friends) {
			this.ne({
				requests: requests,
				requested: requested,
				friends: friends
			});
		}), fn);
	}
};

module.exports = f;