"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");
var Key = require("./crypto/Key");
var User = require("./user");
var search = require("./search");
var Decryptor = require("./crypto/Decryptor");

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

function getFriends(view, uid, cb) {
	step(function () {
		client.smembers("friends:" + uid, this);
	}, h.sF(function (ids) {
		this.ne(ids);
	}), cb);
}

function addFriendName(view, user) {
		step(function () {
			user.getName(this);
		}, h.sF(function (name) {
			search.friendsSearch(view).addUser(user.getID(), name);
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
}

var friends = {
	getFriendsKeys: function (view, otherUser, cb) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			//TODO check signature

			this.parallel.unflatten();

			ownUser.getFriendsKey(view, this.parallel());
			ownUser.getFriendsLevel2KeyF(view, this.parallel());
			otherUser.getFriendsLevel2KeyF(view, this.parallel());
		}), h.sF(function (friendsKey, friendsLevel2Key, otherFriendsLevel2Key) {
			this.parallel.unflatten();

			Key.get(friendsKey, this.parallel());
			Key.get(friendsLevel2Key, this.parallel());
			Key.get(otherFriendsLevel2Key, this.parallel());
		}), cb);
	},
	add: function (view, uid, signedRequest, key, decryptors, cb) {
		var toAddUser, ownID, friendsKey, friendsLevel2Key, otherFriendsLevel2Key, m, firstRequest;
		step(function getUser() {
			User.getUser(uid, this);
		}, h.sF(function checkAlreadyRequested(toAdd) {
			toAddUser = toAdd;
			ownID = view.getUserID();
			uid = toAddUser.getID();

			this.parallel.unflatten();

			client.sismember("friends:" + ownID + ":requested", uid, this.parallel());
			client.sismember("friends:" + ownID, uid, this.parallel());
		}), h.sF(function getFriendKeys(haveIRequested, allreadyFriends) {
			if (haveIRequested || allreadyFriends) {
				this.last.ne(true);
			} else {
				friends.getFriendsKeys(view, toAddUser, this);
			}
		}), h.sF(function hasOtherRequested(fKey, fKeyL2, oFKeyL2) {
			friendsKey = fKey;
			friendsLevel2Key = fKeyL2;
			otherFriendsLevel2Key = oFKeyL2;

			client.sismember("friends:" + ownID + ":requests", uid, this.parallel());
		}), h.sF(function createData(hasOtherRequested) {
			firstRequest = !hasOtherRequested;

			m = client.multi();

			m.set("friends:" + ownID + ":signed:" + uid, signedRequest);

			if (hasOtherRequested) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);
				m.srem("friends:" + ownID + ":requests", uid);
				m.srem("friends:" + uid + ":requested", ownID);

				this.parallel.unflatten();

				Decryptor.validateNoThrow(view, decryptors.ownFriendsLevel2Key, friendsLevel2Key, this.parallel());
				Decryptor.validateNoThrow(view, decryptors.otherFriendsLevel2Key, otherFriendsLevel2Key, this.parallel());
			} else {
				m.sadd("friends:" + ownID + ":requested", uid);
				m.sadd("friends:" + uid + ":requests", ownID);
				this.ne(true, true);
			}
		}), h.sF(function validateDecryptor(validOwn, validOther) {
			if (!validOwn || !validOther) {
				this.last.ne(false);
				return;
			}

			SymKey.createWDecryptors(view, key, this);
		}), h.sF(function () {

			Decryptor.validate(view, decryptors.friendsKey, friendsKey, this.parallel());
		}), h.sF(function hasOtherRequested() {

			m.exec(this.parallel());

			friendsKey.addDecryptor(view, decryptors.friendsKey, this.parallel());
			if (!firstRequest) {
				friendsLevel2Key.addDecryptor(view, decryptors.ownFriendsLevel2Key, this.parallel());
				otherFriendsLevel2Key.addDecryptor(view, decryptors.otherFriendsLevel2Key, this.parallel());
			}
		}), h.sF(function addFriendsName() {
			addFriendName(view, toAddUser);
			this.ne();
		}), cb);
	},
	myMutual: function (view, uid, cb) {
		step(function getUIDUser() {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			mutual(view.getUserID(), theUser.getID(), this);
		}), cb);
	},
	getUser: function (view, uid, cb) {
		getFriends(view, uid, cb);
	},
	get: function (view, cb) {
		getFriends(view, view.getUserID(), cb);
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