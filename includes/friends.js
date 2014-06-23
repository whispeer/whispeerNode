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

function getFriends(request, uid, cb) {
	step(function () {
		client.smembers("friends:" + uid, this);
	}, h.sF(function (ids) {
		this.ne(ids);
	}), cb);
}

function addFriendName(request, user) {
		step(function () {
			user.getName(request, this);
		}, h.sF(function (name) {
			var searchF = new search.friendsSearch(request.session.getUserID());
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

function getUserLevel2Key(request, otherUser, cb) {
	step(function () {
		otherUser.getFriendsLevel2Key(request, this);
	}, h.sF(function (otherFriendsLevel2Key) {
		KeyApi.get(otherFriendsLevel2Key, this);
	}), cb);
}

function createAcceptSpecificData(request, friendShip, multi, cb) {
	step(function () {
		getUserLevel2Key(request, friendShip.user, this);
	}, h.sF(function (otherFriendsLevel2Key) {
		var ownID = request.session.getUserID(), 
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
			if (e) {
				console.error(e);
			}
		});
	},
	notifyAllFriends: function (request, channel, content) {
		friends.notifyUsersFriends(request.session.getUserID(), channel, content);
	},
	areFriends: function (request, uid, cb) {
		var ownID = request.session.getUserID();
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
	getOnline: function (request, cb) {
		getUserOnlineFriends(request.session.getUserID(), cb);
	},
	isOnline: function (request, uid, cb) {
		step(function () {
			var ownID = request.session.getUserID();

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
	hasOtherRequested: function (request, uid, cb) {
		var ownID = request.session.getUserID();
		step(function () {
			client.sismember("friends:" + ownID + ":requests", uid, this);
		}, cb);
	},
	hasFriendsKeyAccess: function (request, uid, cb) {
		step(function () {
			if (parseInt(request.session.getUserID(), 10) === parseInt(uid, 10)) {
				this.last.ne(true);
				return;
			}

			this.parallel.unflatten();

			friends.areFriends(request, uid, this.parallel());
			friends.hasOtherRequested(request, uid, this.parallel());
		}, h.sF(function (areFriends, hasORequested) {
			this.ne(areFriends || hasORequested);
		}), cb);
	},
	getFriendsKeys: function (request, cb) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getFriendsKeys(request, this, {
				noSuffix: true,
				keyObject: true
			});
		}), cb);
	},
	add: function (request, uid, signedRequest, key, decryptors, cb) {
		var m, firstRequest;
		var friendShip = {
			decryptors: decryptors
		};

		step(function getUser() {
			User.getUser(uid, this);
		}, h.sF(function checkAlreadyRequested(toAdd) {
			var ownID = request.session.getUserID();
			var uid = toAdd.getID();

			friendShip.user = toAdd;

			this.parallel.unflatten();

			client.sismember("friends:" + ownID + ":requested", uid, this.parallel());
			client.sismember("friends:" + ownID, uid, this.parallel());
		}), h.sF(function getFriendKeys(haveIRequested, allreadyFriends) {
			if (haveIRequested || allreadyFriends) {
				this.last.ne(true);
			} else {
				friends.getFriendsKeys(request, this);
			}
		}), h.sF(function hasOtherRequested(keys) {
			friendShip.keys = keys;
			friendShip.decryptors.friends = decryptors[friendShip.keys.friends.getRealID()][0];

			client.sismember("friends:" + request.session.getUserID() + ":requests", friendShip.user.getID(), this);
		}), h.sF(function createData(hasOtherRequested) {
			firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendShip.decryptors.friends);

			m = client.multi();

			m.set("friends:" + request.session.getUserID() + ":signed:" + friendShip.user.getID(), signedRequest);

			if (hasOtherRequested) {
				createAcceptSpecificData(request, friendShip, m, this);
			} else {
				m.sadd("friends:" + request.session.getUserID() + ":requested", friendShip.user.getID());
				m.sadd("friends:" + friendShip.user.getID() + ":requests", request.session.getUserID());
				this.ne();
			}
		}), h.sF(function createSymKey() {
			SymKey.createWDecryptors(request, key, this);
		}), h.sF(function keyCreated(key) {
			m.set("friends:key:" + friendShip.user.getID() + ":" + request.session.getUserID(), key.getRealID());

			this.parallel.unflatten();

			Decryptor.validateNoThrow(request, friendShip.decryptors.friends, friendShip.keys.friends, this.parallel());

			if (!firstRequest) {
				Decryptor.validateNoThrow(request, friendShip.decryptors.friendsLevel2, friendShip.keys.friendsLevel2, this.parallel());
				Decryptor.validateNoThrow(request, friendShip.decryptors.otherFriendsLevel2, friendShip.keys.otherFriendsLevel2, this.parallel());
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

			friendShip.keys.friends.addDecryptor(request, friendShip.decryptors.friends, this.parallel());
			if (!firstRequest) {
				friendShip.keys.friendsLevel2.addDecryptor(request, friendShip.decryptors.friendsLevel2, this.parallel());
				friendShip.keys.otherFriendsLevel2.addDecryptor(request, friendShip.decryptors.otherFriendsLevel2, this.parallel());
			}
		}), h.sF(function addFriendsName() {
			addFriendName(request, friendShip.user);
			if (firstRequest) {
				client.publish("user:" + friendShip.user.getID() + ":friendRequest", request.session.getUserID());
			} else {
				client.publish("user:" + friendShip.user.getID() + ":friendAccept", request.session.getUserID());
			}

			this.ne(true);
		}), cb);
	},
	myMutual: function (request, uid, cb) {
		step(function getUIDUser() {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			mutual(request.session.getUserID(), theUser.getID(), this);
		}), cb);
	},
	getFriendsOfFriends: function (request, cb) {
		step(function () {
			getFriends(request, request.session.getUserID(), this);
		}, h.sF(function (ids) {
			var keys = ids.map(function (id) {
				return "friends:" + id;
			});

			keys.push("friends:" + request.session.getUserID());

			client.sunion(keys, this);
		}), h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getUser: function (request, uid, cb) {
		step(function () {
			friends.areFriends(request, uid, this);
		}, h.sF(function (hasFriend) {
			if (hasFriend) {
				getFriends(request, uid, this);
			} else {
				this.ne([]);
			}
		}), cb);
	},
	get: function (request, cb) {
		getFriends(request, request.session.getUserID(), cb);
	},
	getRequests: function (request, cb) {
		step(function () {
			client.smembers("friends:" + request.session.getUserID() + ":requests", this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	getRequested: function (request, cb) {
		step(function () {
			client.smembers("friends:" + request.session.getUserID() + ":requested", this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	}
};

module.exports = friends;