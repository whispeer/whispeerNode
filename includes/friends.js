"use strict";

var step = require("step");
var h = require("whispeerHelper");
const Bluebird = require("bluebird")

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var Decryptor = require("./crypto/decryptor");
var SymKey = require("./crypto/symKey");

var verifySecuredMeta = require("./verifyObject");
var pushAPI = require("./pushAPI");

function pushFriendRequest(request, senderId, receiver) {
	step(function () {
		var User = require("./user");

		User.getUser(senderId, this);
	}, h.sF(function (sender) {
		sender.getNames(request, this);
	}), h.sF(function (senderNames) {
		var senderName = senderNames.firstName || senderNames.lastName || senderNames.nickname;

		var referenceType = "contactRequest";

		pushAPI.getTitle(receiver, referenceType, senderName).then(function (title) {
			return pushAPI.notifyUser(receiver.getID(), title, {
				type: referenceType,
				id: senderId
			});
		})
	}));
}

var Notification = require("./notification");

function hasFriend(uid, friendid, cb) {
	return client.sismemberAsync("friends:" + uid, friendid).nodeify(cb);
}

function mutual(uid1, uid2, cb) {
		return client.sinterAsync("friends:" + uid1, "friends:" + uid2).nodeify(cb);
}

function getFriends(request, uid, cb) {
	return client.smembersAsync("friends:" + uid).nodeify(cb);
}

function addFriendName(request, user) {
	return Bluebird.try(() => {
		user.updateSearch(request);
		return request.session.getOwnUser();
	}).then((me) => {
		me.updateSearch(request);
	}).catch((e) => {
		console.error(e);
	})
}

function getUserOnlineFriends(uid, cb) {
	return client.sinterAsync("friends:" + uid, "user:online").then((friends) => {
		return friends || []
	}).nodeify(cb);
}

function getUserOnlineFriendsStatus(uid, cb) {
	return getUserOnlineFriends(uid).then(function (onlineFriends) {
		var result = {};

		onlineFriends.forEach(function (friend) {
			result[friend] = 2;
		});

		return result;
	}).nodeify(cb);
}

function setSignedList(request, m, signedList, add, remove, cb) {
	var ownID = request.session.getUserID();

	step(function () {
		return client.hgetallAsync("friends:" + ownID + ":signedList");
	}, h.sF(function (oldSignedList) {
		oldSignedList = oldSignedList || {};

		var oldUids = Object.keys(oldSignedList).filter(function (key) { return key[0] !== "_"; }).map(h.parseDecimal);
		var newUids = Object.keys(signedList).filter(function (key) { return key[0] !== "_"; }).map(h.parseDecimal);

		var shouldBeRemoved = h.arraySubtract(oldUids, newUids);
		var shouldBeAdded = h.arraySubtract(newUids, oldUids);

		if (!h.arrayEqual(remove, shouldBeRemoved)) {
			throw new Error("signedList update error");
		}

		if (!h.arrayEqual(add, shouldBeAdded)) {
			throw new Error("signedList update error");
		}

		verifySecuredMeta(request, signedList, "signedFriendList", this);
	}), h.sF(function () {
		//TODO: get all signed list keys!

		//update signedList
		m.del("friends:" + ownID + ":signedList");
		m.hmset("friends:" + ownID + ":signedList", signedList);

		this.ne();
	}), cb);
}

function notifySignedListUpdate(request, signedList, cb) {
	step(function () {
		request.session.getOwnUser(this);
	}, h.sF(function (ownUser) {
		ownUser.notify("signedList", signedList);

		this.ne();
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
		}, h.sF(function (isFriend, isOnline) {
			if (!isFriend) {
				this.ne(-1);
			} else if (!isOnline) {
				this.ne(0);
			} else {
				this.ne(2);
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
		if (h.parseDecimal(request.session.getUserID()) === h.parseDecimal(uid)) {
			return Bluebird.resolve(true).nodeify(cb);
		}

		step(function () {
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
	/** remove a friend
	* @param request
	* @param uid uid of friend to remove
	* @param signedList list of my friends after removal of user uid
	* @param signedRemove signed removal request
	* @param cb
	*/
	remove: function (request, uid, signedList, signedRemove, cb) {
		//TODO: maybe invalidate other users friendShipKey? maybe just remove it?
		var m = client.multi(), ownID = request.session.getUserID();
		uid = h.parseDecimal(uid);

		step(function () {
			this.parallel.unflatten();
			client.sismember("friends:" + uid, ownID, this.parallel());
			client.sismember("friends:" + ownID, uid, this.parallel());
			client.sismember("friends:" + ownID + ":unfriended" , uid, this.parallel());
		}, h.sF(function (friends, friend2, unfriended) {
			if (friends !== friend2 || friends && unfriended) {
				throw new Error("data error ... this is not good!");
			}

			if (!friends && !unfriended) {
				this.last.ne(false);
				return;
			}

			if (friends) {
				/* remove from both friends list */
				m.srem("friends:" + uid, ownID);
				m.srem("friends:" + ownID, uid);

				/* save signed unfriending and add to unfriended list */
				m.sadd("friends:" + uid + ":unfriended", ownID);
				m.hmset("friends:" + ownID + ":" + uid + ":unfriending", signedRemove);
			} else {
				//remove unfriending "request"
				m.srem("friends:" + ownID + ":unfriended", uid);
				m.del("friends:" + uid + ":" + ownID + ":unfriending");
			}

			/* remove friendship detail data for myself */
			m.del("friends:" + ownID + ":" + uid);

			setSignedList(request, m, signedList, [], [uid], this);
		}), h.sF(function () {
			client.hget("friends:" + ownID + ":signedList", uid, this);
		}), h.sF(function (friendShipKey) {
			KeyApi.get(friendShipKey, this);
		}), h.hE(function (e, friendShipKey) {
			if (e) {
				this.ne();
			} else {
				//remove: friendShipKey from ownid for uid
				friendShipKey.remove(m, this);
			}
		}, KeyNotFound), h.sF(function () {
			m.exec(this);
		}), h.sF(function () {
			notifySignedListUpdate(request, signedList, this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	},
	ignoreRequest: function (request, uid, cb) {
		var m = client.multi(), ownID = request.session.getUserID();
		uid = h.parseDecimal(uid);

		step(function () {
			client.sismember("friends:" + ownID + ":requests", uid, this);
		}, h.sF(function (request) {
			if (!request) {
				this.last.ne(false);
				return;
			}

			m.srem("friends:" + ownID + ":requests", uid);
			m.sadd("friends:" + ownID + ":ignored", uid);

			m.exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	},
	declineRequest: function (request, uid, signedRemove, cb) {
		var m = client.multi(), ownID = request.session.getUserID();
		uid = h.parseDecimal(uid);

		//move a friend request to the ignore list
		step(function () {
			client.sismember("friends:" + ownID + ":requests", uid, this);
		}, h.sF(function (request) {
			if (!request) {
				this.last.ne(false);
				return;
			}

			/* remove from request lists */
			m.srem("friends:" + ownID + ":requests", uid);
			m.srem("friends:" + uid + ":requested", ownID);

			/* save signed unfriending and add to unfriended list */
			m.sadd("friends:" + uid + ":unfriended", ownID);
			m.hmset("friends:" + ownID + ":" + uid + ":unfriending", signedRemove);

			client.hget("friends:" + uid + ":signedList", ownID, this);
		}), h.sF(function (friendShipKey) {
			KeyApi.get(friendShipKey, this);
		}), h.sF(function (friendShipKey) {
			//remove: friendShipKey from uid for ownid
			friendShipKey.remove(m, this);
		}), h.sF(function () {
			m.exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	},
	getSignedData: function (request, uid, cb) {
		step(function () {
			var ownID = request.session.getUserID();
			this.parallel.unflatten();
			client.hgetall("friends:" + uid + ":" + ownID, this.parallel());
			client.hgetall("friends:" + uid + ":" + ownID + ":unfriending", this.parallel());
		}, h.sF(function (signed1, signed2) {
			if (signed1 && signed2) {
				throw new Error("invalid data in database");
			}

			this.ne(signed1 || signed2);
		}), cb);
	},
	add: function (request, meta, signedList, key, decryptors, cb) {
		var m, firstRequest;
		var friendShip = {
			decryptors: decryptors
		};

		var domain = "friends:" + request.session.getUserID();

		step(function getUser() {
			User.getUser(meta.user, this);
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

			//TODO: check meta format

			this.parallel.unflatten();
			client.sismember(domain + ":requests", friendShip.user.getID(), this.parallel());
			client.sismember("friends:" + friendShip.user.getID() + ":unfriended", request.session.getUserID(), this.parallel());
		}), h.sF(function createData(hasOtherRequested, revertRemoval) {
			firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendShip.decryptors.friends);

			m = client.multi();

			m.hmset(domain + ":" + friendShip.user.getID(), meta);

			var ownID = request.session.getUserID(),
				uid = friendShip.user.getID();

			if (revertRemoval) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);

				m.del("friends:" + ownID + ":" + uid + ":unfriending");
				m.srem("friends:" + uid + ":unfriended", ownID);
			} else if (hasOtherRequested) {
				m.sadd("friends:" + uid, ownID);
				m.sadd("friends:" + ownID, uid);
				m.srem("friends:" + ownID + ":requests", uid);
				m.srem("friends:" + uid + ":requested", ownID);
			} else {
				m.sadd(domain + ":requested", uid);
				m.sadd("friends:" + uid + ":requests", ownID);
			}

			if (key.realid !== signedList[friendShip.user.getID()]) {
				throw new Error("key realid does not match signedList!");
			}

			setSignedList(request, m, signedList, [uid], [], this);
		}), h.sF(function () {
			SymKey.create(request, key, this);
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
				Notification.add([friendShip.user], "friend", "new", request.session.getUserID(), {
					sendMailWhileOnline: true
				});

				pushFriendRequest(request, request.session.getUserID(), friendShip.user);
				friendShip.user.notify("friendRequest", request.session.getUserID());
			} else {
				Notification.add([friendShip.user], "friend", "accept", request.session.getUserID(), {
					sendMailWhileOnline: true
				});
				friendShip.user.notify("friendAccept", request.session.getUserID());
			}

			notifySignedListUpdate(request, signedList, this);
		}), h.sF(function () {
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
		client.smembers("friends:" + request.session.getUserID() + ":requests", cb);
	},
	getIgnored: function (request, cb) {
		client.smembers("friends:" + request.session.getUserID() + ":ignored", cb);
	},
	getRemoved: function (request, cb) {
		client.smembers("friends:" + request.session.getUserID() + ":unfriended", cb);
	},
	getDeleted: function (request, cb) {
		client.smembers("friends:" + request.session.getUserID() + ":deleted", cb);
	},
	getRequested: function (request, cb) {
		step(function () {
			client.smembers("friends:" + request.session.getUserID() + ":requested", this);
		}, h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	},
	checkFriendShip: function (errors, uid, friendID, cb) {
		step(function () {
			this.parallel.unflatten();

			client.sismember("friends:" + uid + ":requests", friendID, this.parallel());
			client.sismember("friends:" + uid + ":requested", friendID, this.parallel());
			client.sismember("friends:" + uid, friendID, this.parallel());
			client.sismember("friends:" + uid + ":unfriended", friendID, this.parallel());
			client.sismember("friends:" + uid + ":ignored", friendID, this.parallel());

			client.sismember("friends:" + friendID + ":requests", uid, this.parallel());
			client.sismember("friends:" + friendID + ":requested", uid, this.parallel());
			client.sismember("friends:" + friendID, uid, this.parallel());
			client.sismember("friends:" + friendID + ":unfriended", uid, this.parallel());
			client.sismember("friends:" + friendID + ":ignored", uid, this.parallel());
		}, h.sF(function (requests1, requested1, friend1, unfriended1, ignored1, requests2, requested2, friend2, unfriended2, ignored2) {
			if (requests1 && !requested2 && !ignored2) {
				errors.push("FriendShip invalid: " + uid + "-" + friendID + " request but not requested");
			} else if (requested1 && !requests2 && !ignored2) {
				errors.push("FriendShip invalid: " + uid + "-" + friendID + " requested but no request");
			} else if (friend1 && !friend2 && !unfriended2) {
				errors.push("FriendShip invalid: " + uid + "-" + friendID + " friend but not friend or unfriended");
			} else if (unfriended1 && !friend2 && !unfriended2) {
				errors.push("FriendShip invalid: " + uid + "-" + friendID + " unfriended but not friend or unfriended");
			}

			if (requests1 || requested1 || friend1) {
				client.hgetall("friends:" + uid + ":" + friendID, this);
			} else if (unfriended1) {
				client.hgetall("friends:" + uid + ":unfriending:" + friendID, this);
			} else {
				throw new Error("database changed. Please validate on a duplicate!");
			}

			this.ne();
		}),cb);
	},
	checkSignedList: function (errors, uid, cb) {
		step(function () {
			this.parallel.unflatten();

			client.hgetall("friends:" + uid + ":signedList", this.parallel());
			client.smembers("friends:" + uid + ":requests", this.parallel());
			client.smembers("friends:" + uid + ":requested", this.parallel());
			client.smembers("friends:" + uid, this.parallel());
			client.smembers("friends:" + uid + ":unfriended", this.parallel());
			client.smembers("friends:" + uid + ":ignored", this.parallel());
		}, h.sF(function (signedList, requests, requested, userFriends, unfriended, ignored) {
			requested = requested.map(h.parseDecimal);
			userFriends = userFriends.map(h.parseDecimal);
			unfriended = unfriended.map(h.parseDecimal);
			requests = requests.map(h.parseDecimal);
			ignored = ignored.map(h.parseDecimal);

			var signedListIDs = Object.keys(signedList || {}).filter(function (key) {
				return key[0] !== "_";
			}).map(h.parseDecimal);

			var listFriends = requested.concat(userFriends);

			if (!h.arrayEqual(signedListIDs, listFriends)) {
				errors.push("signed lists do not match for uid: " + uid + " - " + signedListIDs + " - " + listFriends);
			}

			signedListIDs.forEach(function (id) {
				KeyApi.checkKey(errors, signedList[id], this.parallel());
			}, this);

			if (!h.emptyUnion(requests, requested)) 	{ errors.push("requests and requested are not exclusive for " + uid); }
			if (!h.emptyUnion(requests, userFriends)) 	{ errors.push("requests and friends are not exclusive for " + uid); }
			if (!h.emptyUnion(requests, unfriended)) 	{ errors.push("requests and unfriended are not exclusive for " + uid); }
			if (!h.emptyUnion(requests, ignored)) 		{ errors.push("requests and ignored are not exclusive for " + uid); }
			if (!h.emptyUnion(requested, userFriends)) 	{ errors.push("requested and friends are not exclusive for " + uid); }
			if (!h.emptyUnion(requested, unfriended)) 	{ errors.push("requested and unfriended are not exclusive for " + uid); }
			if (!h.emptyUnion(requested, ignored)) 		{ errors.push("requested and ignored are not exclusive for " + uid); }
			if (!h.emptyUnion(userFriends, unfriended)) { errors.push("friends and unfriended are not exclusive for " + uid); }
			if (!h.emptyUnion(userFriends, ignored)) 	{ errors.push("friends and ignored are not exclusive for " + uid); }
			if (!h.emptyUnion(unfriended, ignored)) 	{ errors.push("unfriendedand ignored are not exclusive for " + uid); }

			requests.concat(requested).concat(userFriends).concat(unfriended).forEach(function (friendID) {
				friends.checkFriendShip(errors, uid, friendID, this.parallel());
			}, this);

			this.parallel()();
		}), cb);
	}
};

module.exports = friends;
