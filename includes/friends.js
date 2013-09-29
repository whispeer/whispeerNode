"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var Key = require("./crypto/Key");
var User = require("./user");

/*
	Friends: {

	}

*/

function mutual(uid1, uid2, cb) {
		step(function () {
			client.sinter("friends:" + uid1, "friends:" + uid2, this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
}

var friends = {
	getFriendsKey: function () {

	},
	add: function (view, uid, signedRequest, cb) {
		var toAddUser, ownID;
		step(function () {
			User.getUser(uid, this);
		}, h.sF(function (toAdd) {
			toAddUser = toAdd;
			ownID = view.getUserID();

			client.sismember("friends:" + ownID + ":requests", uid, this.parallel());
			client.sismember("friends:" + ownID + ":requested", uid, this.parallel());
			client.sismember("friends:" + ownID, uid, this.parallel());
		}), h.sF(function (hasOtherRequested, haveIRequested, allreadyFriends) {
			if (haveIRequested || allreadyFriends) {
				this.last.ne(true);
			}

			//TODO check signature

			var m = client.multi();

			if (hasOtherRequested) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);
				m.srem("friends:" + ownID + ":requests", uid);
				m.srem("friends:" + uid + ":requested", ownID);
			} else {
				m.sadd("friends:" + ownID + ":requested", uid);
				m.sadd("friends:" + uid + ":requests", ownID);
			}

			m.set("friends:" + ownID + ":signed:" + uid, signedRequest);

			m.exec(this);
		}), h.sF(function () {
		}), cb);
		//do we already have a request from this user? if no: request->send
		//client.sadd("")
	},
	myMutual: function (view, uid, cb) {
		step(function getUIDUser() {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			mutual(view.getUserID(), theUser.getID(), this);
		}), cb);
	},
	get: function (view, cb) {
		step(function () {
			client.smembers("friends:" + view.getUserID(), this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getRequests: function (view, cb) {
		step(function () {
			client.smembers("friends:" + view.getUserID() + ":requests", this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getRequested: function (view, cb) {
		step(function () {
			client.smembers("friends:" + view.getUserID() + ":requested", this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	}
};

module.exports = friends;