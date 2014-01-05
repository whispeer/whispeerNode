"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var search = require("./search");
var Decryptor = require("./crypto/Decryptor");
var SymKey = require("./crypto/symKey");

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
			user.getName(view, this);
		}, h.sF(function (name) {
			var searchF = new search.friendsSearch(view.getUserID());
			searchF.addUser(user.getID(), name);
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
}

var friends = {
	areFriends: function (view, uid, cb) {
		var ownID = view.getUserID();
		step(function () {
			this.parallel.unflatten();

			client.sismember("friends:" + ownID, uid, this.parallel());
			client.sismember("friends:" + uid, ownID, this.parallel());
		}, h.sF(function (friend1, friend2) {
			if (friend1 !== friend2) {
				console.error("CORRUPT DATA!" + ownID + "-" + uid);
			}

			this.ne(friend1 && friend2);
		}), cb);
	},
	hasOtherRequested: function (view, uid, cb) {
		var ownID = view.getUserID();
		step(function () {
			client.sismember("friends:" + ownID + ":requests", uid, this);
		}, cb);
	},
	hasFriendsKeyAccess: function (view, uid, cb) {
		step(function () {
			if (parseInt(view.getUserID(), 10) === parseInt(uid, 10)) {
				this.last.ne(true);
				return;
			}

			friends.areFriends(view, uid, this.parallel());
			friends.hasOtherRequested(view, uid, this.parallel());
		}, h.sF(function (areFriends, hasORequested) {
			this.ne(areFriends || hasORequested);
		}), cb);
	},
	getFriendsKeys: function (view, otherUser, cb) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			//TODO check signature

			this.parallel.unflatten();

			ownUser.getFriendsKey(view, this.parallel());
			ownUser.getFriendsLevel2Key(view, this.parallel());
			otherUser.getFriendsLevel2Key(view, this.parallel());
		}), h.sF(function (friendsKey, friendsLevel2Key, otherFriendsLevel2Key) {
			this.parallel.unflatten();

			KeyApi.get(friendsKey, this.parallel());
			KeyApi.get(friendsLevel2Key, this.parallel());
			KeyApi.get(otherFriendsLevel2Key, this.parallel());
		}), cb);
	},
	add: function (view, uid, signedRequest, key, decryptors, cb) {
		var toAddUser, ownID, friendsKey, friendsLevel2Key, otherFriendsLevel2Key, m, firstRequest;
		var friendsKeyDecryptor, friendsLevel2KeyDecryptor, otherFriendsLevel2KeyDecryptor;

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

			friendsKeyDecryptor = decryptors[friendsKey.getRealID()][0];

			client.sismember("friends:" + ownID + ":requests", uid, this);
		}), h.sF(function createData(hasOtherRequested) {
			firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendsKeyDecryptor);

			m = client.multi();

			m.set("friends:" + ownID + ":signed:" + uid, signedRequest);

			if (hasOtherRequested) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);
				m.srem("friends:" + ownID + ":requests", uid);
				m.srem("friends:" + uid + ":requested", ownID);


				friendsLevel2KeyDecryptor = decryptors[friendsLevel2Key.getRealID()][0];
				otherFriendsLevel2KeyDecryptor = decryptors[otherFriendsLevel2Key.getRealID()][0];

				Decryptor.validateFormat(friendsLevel2KeyDecryptor);
				Decryptor.validateFormat(otherFriendsLevel2KeyDecryptor);

				this.ne();
			} else {
				m.sadd("friends:" + ownID + ":requested", uid);
				m.sadd("friends:" + uid + ":requests", ownID);
				this.ne();
			}
		}), h.sF(function createSymKey() {
			SymKey.createWDecryptors(view, key, this);
		}), h.sF(function keyCreated(key) {
			m.set("friends:key:" + uid + ":" + ownID, key.getRealID());

			this.parallel.unflatten();

			Decryptor.validateNoThrow(view, friendsKeyDecryptor, friendsKey, this.parallel());

			if (!firstRequest) {
				Decryptor.validateNoThrow(view, friendsLevel2KeyDecryptor, friendsLevel2Key, this.parallel());
				Decryptor.validateNoThrow(view, otherFriendsLevel2KeyDecryptor, otherFriendsLevel2Key, this.parallel());
			}
		}), h.sF(function (valid1, valid2, valid3) {
			var validLevel2 = valid2 && valid3;

			//TODO: remove key;

			if (!firstRequest && !validLevel2) {
				this.last.ne(false);
				return;
			}

			if (!valid1) {
				throw new InvalidDecryptor();
			}

			m.exec(this.parallel());

			friendsKey.addDecryptor(view, friendsKeyDecryptor, this.parallel());
			if (!firstRequest) {
				friendsLevel2Key.addDecryptor(view, friendsLevel2KeyDecryptor, this.parallel());
				otherFriendsLevel2Key.addDecryptor(view, otherFriendsLevel2KeyDecryptor, this.parallel());
			}
		}), h.sF(function addFriendsName() {
			addFriendName(view, toAddUser);
			if (firstRequest) {
				client.publish("user:" + uid + ":friendRequest", ownID, this);
			} else {
				client.publish("user:" + uid + ":friendAccept", ownID, this);
			}
			this.ne(true);
		}), cb);
	},
	myMutual: function (view, uid, cb) {
		step(function getUIDUser() {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			mutual(view.getUserID(), theUser.getID(), this);
		}), cb);
	},
	getFriendsOfFriends: function (view, cb) {
		step(function () {
			getFriends(view, view.getUserID(), this);
		}, h.sF(function (ids) {
			var keys = ids.map(function (id) {
				return "friends:" + id;
			});

			client.sunion(keys, this);
		}), h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getUser: function (view, uid, cb) {
		getFriends(view, uid, cb);
	},
	get: function (view, cb) {
		friends.getFriendsOfFriends(view, function () {
		});
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