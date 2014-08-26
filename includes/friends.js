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
	step(function () {
		client.sinter("friends:" + uid, "user:online", this);
	}, h.sF(function (friends) {
		friends = friends || [];

		this.ne(friends);
	}), cb);
}

function getUserOnlineFriendsStatus(uid, cb) {
	var onlineFriends = [];
	step(function () {
		getUserOnlineFriends(uid, this);
	}, h.sF(function (friends) {
		onlineFriends = friends;

		friends.forEach(function (friend) {
			client.get("user:" + friend + ":recentActivity", this.parallel());
		}, this);

		if (friends.length === 0) {
			this.last.ne({});
		}
	}), h.sF(function (recentActivity) {
		var result = {};
		recentActivity = recentActivity || [];
		h.assert(recentActivity.length === onlineFriends.length);

		onlineFriends.forEach(function (friend, index) {
			if (recentActivity[index]) {
				result[friend] = 2;
			} else {
				result[friend] = 1;
			}
		});

		this.ne(result);
	}), cb);
}

var friends = {
	notifyUsersFriends: function (uid, channel, content) {
		step(function () {
			getUserOnlineFriends(uid, this);
		}, h.sF(function (online) {
			online.forEach(function (uid) {
				User.getUser(uid, this.parallel());
			}, this);
		}), h.sF(function (online) {
			online.forEach(function (user) {
				user.notify("friends:" + channel, {
					sender: uid,
					receiver: user.getID(),
					content: content
				});
			});

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
		getUserOnlineFriendsStatus(request.session.getUserID(), cb);
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
			if (h.parseDecimal(request.session.getUserID()) === h.parseDecimal(uid)) {
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
	getFriendShip: function (request, uid, cb) {
		step(function () {
			client.hgetall("friends:" + request.session.getUserID() + ":" + uid, this.parallel());
		}, h.sF(function (meta) {
			this.ne(meta);
		}), cb);
	},
	getFriendsKeys: function (request, cb) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			this.parallel.unflatten();

			ownUser.getFriendsKey(request, this.parallel());
		}), h.sF(function (friendsKey) {
			this.parallel.unflatten();

			KeyApi.get(friendsKey, this.parallel());
		}), h.sF(function (friendsKey) {
			this.ne({
				friends: friendsKey
			});
		}), cb);
	},
	add: function (request, meta, signedList, key, decryptors, cb) {
		var m, firstRequest;
		var friendShip = {
			decryptors: decryptors
		};

		var domain = "friends:" + request.session.getUserID();

		step(function getUser() {
			User.getUser(meta.friend, this);
		}, h.sF(function checkAlreadyRequested(toAdd) {
			var uid = toAdd.getID();

			friendShip.user = toAdd;

			this.parallel.unflatten();

			client.sismember(domain + ":requested", uid, this.parallel());
			client.sismember(domain, uid, this.parallel());
		}), h.sF(function getFriendKeys(haveIRequested, alreadyFriends) {
			if (haveIRequested || alreadyFriends) {
				this.last.ne(true);
			} else {
				friends.getFriendsKeys(request, this);
			}
		}), h.sF(function hasOtherRequested(keys) {
			friendShip.keys = keys;
			friendShip.decryptors.friends = decryptors[friendShip.keys.friends.getRealID()][0];

			//TODO: get friends and requests list. check that they are equal to the signed list content.
			//TODO: check meta format

			client.sismember("friends:" + request.session.getUserID() + ":requests", friendShip.user.getID(), this);
		}), h.sF(function createData(hasOtherRequested) {
			firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendShip.decryptors.friends);

			m = client.multi();

			m.hmset(domain + ":" + friendShip.user.getID(), meta);
			m.hmset(domain + ":signedList", signedList);

			var ownID = request.session.getUserID(),
				uid = friendShip.user.getID();

			if (hasOtherRequested) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);
				m.srem("friends:" + ownID + ":requests", uid);
				m.srem("friends:" + uid + ":requested", ownID);
			} else {
				m.sadd(domain + ":requested", uid);
				m.sadd("friends:" + uid + ":requests", ownID);
			}

			SymKey.createWDecryptors(request, key, this);
		}), h.sF(function keyCreated() {
			Decryptor.validateNoThrow(request, friendShip.decryptors.friends, friendShip.keys.friends, this);
		}), h.sF(function (valid) {
			if (!valid) {
				throw new InvalidDecryptor();
			}

			m.exec(this.parallel());

			friendShip.keys.friends.addDecryptor(request, friendShip.decryptors.friends, this.parallel());
		}), h.sF(function addFriendsName() {
			addFriendName(request, friendShip.user);
			if (firstRequest) {
				friendShip.user.notify("friendRequest", request.session.getUserID());
			} else {
				friendShip.user.notify("friendAccept", request.session.getUserID());
			}

			this.ne(!firstRequest);
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
			if (hasFriend || request.session.getUserID() === h.parseDecimal(uid)) {
				getFriends(request, uid, this);
			} else {
				this.ne([]);
			}
		}), cb);
	},
	get: function (request, cb) {
		getFriends(request, request.session.getUserID(), cb);
	},
	getSignedList: function (request, cb) {
		client.hgetall("friends:" + request.session.getUserID() + ":signedList", cb);
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