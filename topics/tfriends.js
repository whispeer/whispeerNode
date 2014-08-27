"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Friends = require("../includes/friends");
var SymKey = require("./crypto/symKey");
var User = require("./user");

var f = {
	add: function addFriend(data, fn, request) {
		var areFriends;
		step(function () {
			Friends.add(request, data.meta, data.signedList, data.key, data.decryptors, this);
		}, h.sF(function (_areFriends) {
			areFriends = _areFriends;
			Friends.isOnline(request, data.userid, this);
		}), h.sF(function (online) {
			this.ne({
				friendOnline: online,
				success: true,
				friends: areFriends
			});
		}), fn);
	},
	remove: function (data, fn, request) {
		step(function () {
			SymKey.createWDecryptors(request, data.newFriendsKey, this);
		}, h.sF(function () {
			Friends.remove(request, data.uid, data.signedList, data.signedRemoval, this);
		}), h.sF(function (success) {
			if (success) {
				request.session.getOwnUser(this);
			} else {
				this.last.ne({ success: false });
			}
		}), h.sF(function (myUser) {
			myUser.setSignedKeys(request, data.signedKeys, this);
		}), h.sF(function () {
				this.last.ne({ success: false });
		}), fn);
	},
	getOnline: function getOnlineF(data, fn, request) {
		step(function () {
			Friends.getOnline(request, this);
		}, h.sF(function (ids) {
			ids[request.session.getUserID()] = -1;
			this.ne({
				online: ids
			});
		}), fn);
	},
	mutual: function getMutualF(data, fn, request) {
		step(function () {
			Friends.myMutual(request, data.uid, this);
		}, h.sF(function (ids) {
			this.last.ne({
				mutual: ids
			});
		}), fn);
	},
	getUser: function getUserFriends(data, fn, request) {
		step(function () {
			Friends.getUser(request, data.userid, this);
		}, h.sF(function (userFriends) {
			this.ne({
				friends: userFriends
			});
		}), fn);
	},
	all: function getFriends(data, fn, request) {
		step(function () {
			this.parallel.unflatten();

			Friends.getRequests(request, this.parallel());
			Friends.getRequested(request, this.parallel());
			Friends.get(request, this.parallel());
			Friends.getSignedList(request, this.parallel());
		}, h.sF(function (requests, requested, friends, signedList) {
			this.ne({
				requests: requests,
				requested: requested,
				friends: friends,
				signedList: signedList
			});
		}), fn);
	}
};

module.exports = f;