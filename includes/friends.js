"use strict";

var h = require("whispeerHelper");
const Bluebird = require("bluebird")

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var Decryptor = require("./crypto/decryptor");
var SymKey = require("./crypto/symKey");

var verifySecuredMeta = require("./verifyObject");
var pushAPI = require("./pushAPI");

const settingsAPI = require("../includes/settings");
const CompanyUser = require("../includes/models/companyUser")

function pushFriendRequest(request, senderId, receiver) {
	const User = require("./user");
	const referenceType = "contactRequest"

	return User.getUser(senderId)
		.then((sender) => sender.getNames(request))
		.then((senderNames) => {
			const senderName = senderNames.firstName || senderNames.lastName || senderNames.nickname;

			return pushAPI.getTitle(receiver, referenceType, senderName)
		}).then((title) =>
			pushAPI.notifyUser(receiver.getID(), title, {
				type: referenceType,
				id: senderId
			})
		)
}

var Notification = require("./notification");

const hasFriend = (uid, friendid) => client.sismemberAsync("friends:" + uid, friendid)
const mutual = (uid1, uid2) => client.sinterAsync("friends:" + uid1, "friends:" + uid2)
const getFriends = (request, uid) => client.smembersAsync("friends:" + uid)

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

function getUserOnlineFriends(uid) {
	return client
		.sinterAsync("friends:" + uid, "user:online")
		.then((friends) => friends || [])
}

function getUserOnlineFriendsStatus(uid) {
	return getUserOnlineFriends(uid).then(function (onlineFriends) {
		const result = {};

		onlineFriends.forEach(function (friend) {
			result[friend] = 2;
		});

		return result;
	})
}

function setSignedList(request, m, signedList, add, remove) {
	const ownID = request.session.getUserID();

	return Bluebird
		.try(() => client.hgetallAsync(`friends:${ownID}:signedList`))
		.then(function (oldSignedList) {
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

			return verifySecuredMeta(request, signedList, "signedFriendList");
		})
		.then(() => {
			//TODO: get all signed list keys!

			//update signedList
			m.del("friends:" + ownID + ":signedList");
			m.hmset("friends:" + ownID + ":signedList", signedList);
		})
}

function notifySignedListUpdate(request, signedList) {
	return request.session.getOwnUser()
		.then(function (ownUser) {
			ownUser.notify("signedList", signedList)
		})
}

var friends = {
	notifyUsersFriends: function (uid, channel, content) {
		return getUserOnlineFriends(uid)
			.map((uid) => User.getUser(uid))
			.map((user) => user.notify("friends:" + channel, {
				sender: uid,
				receiver: user.getID(),
				content: content
			}))
	},
	notifyAllFriends: (request, channel, content) => friends.notifyUsersFriends(request.session.getUserID(), channel, content),
	areFriends: function (request, uid, cb) {
		const ownID = request.session.getUserID();
		return Bluebird.all([
			hasFriend(ownID, uid),
			hasFriend(uid, ownID),
		]).then(function ([friend1, friend2]) {
			if (friend1 !== friend2) {
				console.error("CORRUPT DATA!" + ownID + "-" + uid);
			}

			return friend1 && friend2
		}).nodeify(cb);
	},
	getOnline: function (request, cb) {
		return getUserOnlineFriendsStatus(request.session.getUserID()).nodeify(cb)
	},
	isOnline: function (request, uid, cb) {
		const ownID = request.session.getUserID();

		return Bluebird.all([
			client.sismemberAsync("friends:" + ownID, uid),
			client.sismemberAsync("user:online", uid),
		]).then(function ([isFriend, isOnline]) {
			if (!isFriend) {
				return -1
			}

			if (!isOnline) {
				return 0
			}

			return 2
		}).nodeify(cb)
	},
	hasOtherRequested: function (request, uid, cb) {
		const ownID = request.session.getUserID();
		return client
			.sismemberAsync(`friends:${ownID}:requests`, uid)
			.nodeify(cb)
	},
	hasFriendsKeyAccess: function (request, uid, cb) {
		if (request.session.isMyID(uid)) {
			return Bluebird.resolve(true).nodeify(cb);
		}

		return Bluebird.all([
			friends.areFriends(request, uid),
			friends.hasOtherRequested(request, uid),
		])
		.then(([areFriends, hasORequested]) => areFriends || hasORequested)
		.nodeify(cb)
	},
	getFriendShip: function (request, uid, cb) {
		return client
			.hgetallAsync(`friends:${request.session.getUserID()}:${uid}`)
			.nodeify(cb)
	},
	getFriendsKeys: function (request, cb) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.getFriendsKey(request))
			.then((friendsKey) => KeyApi.get(friendsKey))
			.then((friendsKey) => ({ friends: friendsKey }))
			.nodeify(cb)
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

		uid = h.parseDecimal(uid);

		return Bluebird.coroutine(function *() {
			const ownID = request.session.getUserID();

			const [friends, friend2, unfriended] = yield Bluebird.all([
				client.sismemberAsync("friends:" + uid, ownID),
				client.sismemberAsync("friends:" + ownID, uid),
				client.sismemberAsync("friends:" + ownID + ":unfriended" , uid),
			])

			if (friends !== friend2 || friends && unfriended) {
				throw new Error("data error ... this is not good!");
			}

			if (!friends && !unfriended) {
				return false
			}

			const m = client.multi()

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

			yield setSignedList(request, m, signedList, [], [uid]);
			const friendShipKey = yield client.hgetAsync(`friends:${ownID}:signedList`, uid)

			yield KeyApi.get(friendShipKey)
				.then((friendShipKey) => friendShipKey.remove(m))
				.catch(KeyNotFound, () => {})

			yield Bluebird.fromCallback((cb) => m.exec(cb))
			yield notifySignedListUpdate(request, signedList)
			return true
		})
		.nodeify(cb)
	},
	ignoreRequest: function (request, uid, cb) {

		const ownID = request.session.getUserID()
		uid = h.parseDecimal(uid);

		return Bluebird.coroutine(function *() {
			const request = yield client.sismemberAsync("friends:" + ownID + ":requests", uid);

			if (!request) {
				return false
			}

			yield Bluebird.fromCallback((cb) =>
				client.multi()
					.srem(`friends:${ownID}:requests`, uid)
					.sadd(`friends:${ownID}:ignored`, uid)
					.exec(cb)
			)

			return true
		}).nodeify(cb)
	},
	getSignedData: function (request, uid, cb) {
		const ownID = request.session.getUserID();

		return Bluebird.all([
			client.hgetallAsync("friends:" + uid + ":" + ownID),
			client.hgetallAsync("friends:" + uid + ":" + ownID + ":unfriending"),
		]).then(function ([signed1, signed2]) {
			if (signed1 && signed2) {
				throw new Error("invalid data in database");
			}

			return signed1 || signed2
		}).nodeify(cb)
	},
	add: function (request, meta, signedList, key, decryptors, cb) {
		const friendShip = { decryptors }

		const domain = "friends:" + request.session.getUserID();

		return Bluebird.coroutine(function *() {
			const toAdd = yield User.getUser(meta.user)
			const uid = toAdd.getID();

			friendShip.user = toAdd;

			const [haveIRequested, alreadyFriends] = yield Bluebird.all([
				client.sismemberAsync(domain + ":requested", uid),
				client.sismemberAsync(domain, uid),
			])

			if (haveIRequested || alreadyFriends) {
				return true
			}

			friendShip.keys = yield friends.getFriendsKeys(request)

			friendShip.decryptors.friends = decryptors[friendShip.keys.friends.getRealID()][0];

			//TODO: check meta format

			const [hasOtherRequested, revertRemoval] = yield Bluebird.all([
				client.sismember(domain + ":requests", friendShip.user.getID()),
				client.sismember("friends:" + friendShip.user.getID() + ":unfriended", request.session.getUserID()),
			])

			const firstRequest = !hasOtherRequested;

			Decryptor.validateFormat(friendShip.decryptors.friends);

			const m = client.multi();

			m.hmset(domain + ":" + friendShip.user.getID(), meta);

			const ownID = request.session.getUserID()

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

			yield setSignedList(request, m, signedList, [uid], []);
			yield SymKey.create(request, key);
			const valid = yield Decryptor.validateNoThrow(request, friendShip.decryptors.friends, friendShip.keys.friends);

			if (!valid) {
				throw new InvalidDecryptor();
			}

			yield Bluebird.all([
				Bluebird.fromCallback(cb => m.exec(cb)),
				friendShip.keys.friends.addDecryptor(request, friendShip.decryptors.friends)
			])

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

			yield notifySignedListUpdate(request, signedList);

			return !firstRequest
		}).nodeify(cb)
	},
	myMutual: function (request, uid, cb) {
		User.getUser(uid)
			.then((theUser) => mutual(request.session.getUserID(), theUser.getID()))
			.nodeify(cb)
	},
	getFriendsOfFriends: function (request, cb) {
		return getFriends(request, request.session.getUserID())
			.then(function (ids) {
				const keys = ids.map((id) => `friends:${id}`)
				keys.push("friends:" + request.session.getUserID())

				return client.sunionAsync(keys)
			})
			.nodeify(cb)
	},
	getUser: function (request, uid, cb) {
		return friends
			.canSeeFriends(request, uid)
			.then(function (canSeeFriends) {
				if (canSeeFriends || request.session.getUserID() === h.parseDecimal(uid)) {
					return getFriends(request, uid);
				}

				return []
			}).nodeify(cb);
	},
	friendsAccess: (uid) => {
		return Bluebird.all([
			CompanyUser.isBusinessUser(uid),
			Bluebird.fromCallback((cb) => settingsAPI.getUserSettings(uid, cb))
		]).then(([businessUser, settings]) => {
			if (typeof settings.server.friendsAccess === "boolean") {
				return settings.server.friendsAccess
			}

			return !businessUser
		})
	},
	canSeeFriends: (request, uid) => {
		if (request.session.getUserID() === h.parseDecimal(uid)) {
			return Bluebird.resolve(true)
		}

		return Bluebird.all([
			Bluebird.fromCallback((cb) => friends.areFriends(request, uid, cb)),
			friends.friendsAccess(uid)
		])
		.then(([areFriends, friendsAccess]) => friendsAccess && areFriends)
	},
	get: (request, cb) => getFriends(request, request.session.getUserID()).nodeify(cb),
	getSignedList: (request, cb) => client.hgetallAsync(`friends:${request.session.getUserID()}:signedList`).nodeify(cb),
	getRequests: (request, cb) => client.smembersAsync(`friends:${request.session.getUserID()}:requests`).nodeify(cb),
	getIgnored: (request, cb) => client.smembersAsync(`friends:${request.session.getUserID()}:ignored`).nodeify(cb),
	getRemoved: (request, cb) => client.smembersAsync(`friends:${request.session.getUserID()}:unfriended`).nodeify(cb),
	getDeleted: (request, cb) => client.smembersAsync(`friends:${request.session.getUserID()}:deleted`).nodeify(cb),
	getRequested: (request, cb) => client.smembersAsync(`friends:${request.session.getUserID()}:requested`).nodeify(cb),
};

module.exports = friends;
