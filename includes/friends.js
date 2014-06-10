"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var search = require("./search");
var Decryptor = require("./crypto/decryptor");
var SymKey = require("./crypto/symKey");

/*
	Friends: {

	}

*/

function hasFriend(uid, friendid, cb) {
	client.sismember("friends:" + uid, friendid, cb);
}

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

function getUserOnlineFriends(uid, cb) {
	var onlineFriends = [];
	step(function () {
		client.sinter("friends:" + uid, "user:online", this);
	}, h.sF(function (friends) {
		onlineFriends = friends || [];
		var i;
		for (i = 0; i < friends.length; i += 1) {
			client.get("user:" + friends[i] + ":recentActivity", this.parallel());
		}

		this.parallel()();
	}), h.sF(function (recentActivity) {
		var result = {};
		recentActivity = recentActivity || [];
		h.assert(recentActivity.length === onlineFriends.length);

		var i;
		for (i = 0; i < onlineFriends.length; i += 1) {
			if (recentActivity[i]) {
				result[onlineFriends[i]] = 2;
			} else {
				result[onlineFriends[i]] = 1;
			}
		}

		this.ne(result);
	}), cb);
}

function getUserLevel2Key(view, otherUser, cb) {
	step(function () {
		otherUser.getFriendsLevel2Key(view, this);
	}, h.sF(function (otherFriendsLevel2Key) {
		KeyApi.get(otherFriendsLevel2Key, this);
	}), cb);
}

function createAcceptSpecificData(view, friendShip, multi, cb) {
	step(function () {
		getUserLevel2Key(view, friendShip.user, this);
	}, h.sF(function (otherFriendsLevel2Key) {
		var ownID = view.getUserID(), 
			uid = friendShip.user.getID(),
			decryptors = friendShip.decryptors;

		friendShip.keys.otherFriendsLevel2 = otherFriendsLevel2Key;

		multi.sadd("friends:" + uid, ownID);
		multi.sadd("friends:" + ownID, uid);
		multi.srem("friends:" + ownID + ":requests", uid);
		multi.srem("friends:" + uid + ":requested", ownID);

		friendShip.decryptors.friendsLevel2 = decryptors[friendShip.keys.friendsLevel2.getRealID()][0];
		friendShip.decryptors.otherFriendsLevel2 = decryptors[otherFriendsLevel2Key.getRealID()][0];

		Decryptor.validateFormat(friendShip.decryptors.friendsLevel2);
		Decryptor.validateFormat(friendShip.decryptors.otherFriendsLevel2);

		this.ne();
	}), cb);
}

var friends = {
	notifyUsersFriends: function (uid, channel, content) {
		step(function () {
			getUserOnlineFriends(uid, this);
		}, h.sF(function (online) {
			online = Object.keys(online);

			var i, currentChannel;
			for (i = 0; i < online.length; i += 1) {
				currentChannel = "user:" + online[i] + ":friends:" + channel;

				client.publish(currentChannel, JSON.stringify({
					sender: uid,
					receiver: online[i],
					content: content
				}));
			}

			this.ne();
		}), function (e) {
			console.error(e);
		});
	},
	notifyAllFriends: function (view, channel, content) {
		friends.notifyUsersFriends(view.getUserID(), channel, content);
	},
	areFriends: function (view, uid, cb) {
		var ownID = view.getUserID();
		step(function () {
			this.parallel.unflatten();

			hasFriend(ownID, uid, this.parallel());
			hasFriend(uid, ownID, this.parallel());
		}, h.sF(function (friend1, friend2) {
			if (friend1 !== friend2) {
				console.error("CORRUPT DATA!" + ownID + "-" + uid);
			}

			this.ne(friend1 && friend2);
		}), cb);
	},
	getOnline: function (view, cb) {
		getUserOnlineFriends(view.getUserID(), cb);
	},
	isOnline: function (view, uid, cb) {
		step(function () {
			var ownID = view.getUserID();

			this.parallel.unflatten();
			client.sismember("friends:" + ownID, uid, this.parallel());
			client.sismember("user:online", uid, this.parallel());
			client.get("user:" + uid + ":recentActivity", this.parallel());
		}, h.sF(function (isFriend, isOnline, recentActivity) {
			if (!isFriend) {
				this.ne(-1);
			} else if (!isOnline) {
				this.ne(0);
			} else if (!recentActivity) {
				this.ne(2);
			} else {
				this.ne(1);
			}
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

			this.parallel.unflatten();

			friends.areFriends(view, uid, this.parallel());
			friends.hasOtherRequested(view, uid, this.parallel());
		}, h.sF(function (areFriends, hasORequested) {
			this.ne(areFriends || hasORequested);
		}), cb);
	},
	getFriendsKeys: function (view, cb) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getFriendsKeys(view, this, {
				noSuffix: true,
				keyObject: true
			});
		}), cb);
	},
	add: function (view, uid, signedRequest, key, decryptors, cb) {
		var m, firstRequest;
		var friendShip = {
			decryptors: decryptors
		};

		step(function getUser() {
			User.getUser(uid, this);
		}, h.sF(function checkAlreadyRequested(toAdd) {
			var ownID = view.getUserID();
			var uid = toAdd.getID();

			friendShip.user = toAdd;

			this.parallel.unflatten();

			client.sismember("friends:" + ownID + ":requested", uid, this.parallel());
			client.sismember("friends:" + ownID, uid, this.parallel());
		}), h.sF(function getFriendKeys(haveIRequested, allreadyFriends) {
			if (haveIRequested || allreadyFriends) {
				this.last.ne(true);
			} else {
				friends.getFriendsKeys(view, this);
			}
		}), h.sF(function hasOtherRequested(keys) {
			friendShip.keys = keys;
			friendShip.decryptors.friends = decryptors[friendShip.keys.friends.getRealID()][0];

			client.sismember("friends:" + view.getUserID() + ":requests", friendShip.user.getID(), this);
		}), h.sF(function createData(hasOtherRequested) {
			firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendShip.decryptors.friends);

			m = client.multi();

			m.set("friends:" + view.getUserID() + ":signed:" + friendShip.user.getID(), signedRequest);

			if (hasOtherRequested) {
				createAcceptSpecificData(view, friendShip, m, this);
			} else {
				m.sadd("friends:" + view.getUserID() + ":requested", friendShip.user.getID());
				m.sadd("friends:" + friendShip.user.getID() + ":requests", view.getUserID());
				this.ne();
			}
		}), h.sF(function createSymKey() {
			SymKey.createWDecryptors(view, key, this);
		}), h.sF(function keyCreated(key) {
			m.set("friends:key:" + friendShip.user.getID() + ":" + view.getUserID(), key.getRealID());

			this.parallel.unflatten();

			Decryptor.validateNoThrow(view, friendShip.decryptors.friends, friendShip.keys.friends, this.parallel());

			if (!firstRequest) {
				Decryptor.validateNoThrow(view, friendShip.decryptors.friendsLevel2, friendShip.keys.friendsLevel2, this.parallel());
				Decryptor.validateNoThrow(view, friendShip.decryptors.otherFriendsLevel2, friendShip.keys.otherFriendsLevel2, this.parallel());
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

			friendShip.keys.friends.addDecryptor(view, friendShip.decryptors.friends, this.parallel());
			if (!firstRequest) {
				friendShip.keys.friendsLevel2.addDecryptor(view, friendShip.decryptors.friendsLevel2, this.parallel());
				friendShip.keys.otherFriendsLevel2.addDecryptor(view, friendShip.decryptors.otherFriendsLevel2, this.parallel());
			}
		}), h.sF(function addFriendsName() {
			addFriendName(view, friendShip.user);
			if (firstRequest) {
				client.publish("user:" + friendShip.user.getID() + ":friendRequest", view.getUserID());
			} else {
				client.publish("user:" + friendShip.user.getID() + ":friendAccept", view.getUserID());
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

			keys.push("friends:" + view.getUserID());

			client.sunion(keys, this);
		}), h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getUser: function (view, uid, cb) {
		step(function () {
			friends.areFriends(view, uid, this);
		}, h.sF(function (hasFriend) {
			if (hasFriend) {
				getFriends(view, uid, this);
			} else {
				this.ne([]);
			}
		}), cb);
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