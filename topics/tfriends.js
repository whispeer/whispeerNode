"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Friends = require("../includes/friends");

var f = {
	add: function addFriend(data, fn, request) {
		/*
			userid,
			fkdecryptor, //is added to our friend key
			signedRequest //signature of "friendShip:userid:nickname"
		*/
		var wasSuccess = false;
		step(function () {
			Friends.add(request, data.userid, data.signedRequest, data.key, data.decryptors, this);
		}, h.sF(function (success) {
			wasSuccess = success;
			Friends.isOnline(request, data.userid, this);
		}), h.sF(function (online) {
			this.ne({
				friendOnline: online,
				friendAdded: wasSuccess
			});
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
	getAll: function getFriends(data, fn, request) {
		step(function () {
			this.parallel.unflatten();

			Friends.getRequests(request, this.parallel());
			Friends.getRequested(request, this.parallel());
			Friends.get(request, this.parallel());
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