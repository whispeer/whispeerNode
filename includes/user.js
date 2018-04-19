"use strict";

/* @refactor */
//this code is totally slugish
//it needs a BIG refactoring!
//first of all: uniquify all keys in one hset
//second of all: define key visibility in an easier way!

const Bluebird = require("bluebird")
const client = require("./redisClient");
const h = require("whispeerHelper");

const search = require("./search");

const EccKey = require("./crypto/eccKey");
const SymKey = require("./crypto/symKey");

const KeyApi = require("./crypto/KeyApi");

const RedisObserver = require("./asset/redisObserver");

const random = require("secure_random");

function logedinF(data) {
	return Bluebird.try(() => {
		if (data.reference.isSaved()) {
			return data.request.session.logedinError();
		}
	})
}

function ownUserF(data) {
	return Bluebird.try(() => {
		if (data.reference.isSaved()) {
			return data.request.session.ownUserError(data.reference);
		}
	})
}

function hasFriendKeyAccess(data) {
	if (!data.reference.isSaved()) {
		return Bluebird.resolve()
	}

	return Bluebird.try(() => {
		const friends = require("./friends");
		return friends.hasFriendsKeyAccess(data.request, data.reference.getID());
	}).then((acc) => {
		if (!acc) {
			throw new AccessViolation("No Key Access");
		}
	})
}

const trueF = () => Bluebird.resolve()

function checkKeyExists(keyClass) {
	return function (data, cb) {
		if (typeof data.value === "object" && data.value instanceof keyClass) {
			return Bluebird.resolve().nodeify(cb)
		}

		return Bluebird
			.fromCallback((cb) => keyClass.get(data.value, cb))
			.then(() => {})
			.nodeify(cb)
	};
}

function keyToRealID(data, cb) {
	if (typeof data.value === "object" && typeof data.value.getRealID === "function") {
		return Bluebird.resolve(data.value.getRealID()).nodeify(cb)
	}

	return Bluebird.resolve(data.value).nodeify(cb)
}

var validKeys = {
	myProfile: {
		read: ownUserF,
		pre: ownUserF
	},
	profile: {
		read: logedinF,
		readTransform: function (data, cb) {
			const val = data.value

			for (let attr in val) {
				if (val.hasOwnProperty(attr)) {
					val[attr] = JSON.parse(val[attr]);
				}
			}

			return Bluebird.resolve(val).nodeify(cb)
		},
		pre: function (data, cb) {
			return Bluebird.try(() => {
				const validator = require("whispeerValidations");
				const err = validator.validate("profile", data);
				if (err) {
					throw err;
				}
			}).nodeify(cb)
		},
		transform: function (data, cb) {
			const val = data.value;

			for (let attr in val) {
				if (val.hasOwnProperty(attr)) {
					val[attr] = JSON.stringify(val[attr]);
				}
			}

			return Bluebird.resolve(val).nodeify(cb)
		},
		hash: true
	},
	migrationState: {
		read: ownUserF,
		pre: ownUserF
	},
	password: {
		read: trueF,
		match: /^[A-Fa-f0-9]{64}$/,
		pre: ownUserF
	},
	signedKeys: {
		read: trueF,
		hash: true
	},
	signedOwnKeys: {
		read: ownUserF,
		pre: ownUserF,
		transform: function (data, cb) {
			return Bluebird.resolve(JSON.stringify(data.value)).nodeify(cb)
		},
		readTransform: function (data, cb) {
			return Bluebird.resolve(JSON.parse(data.value)).nodeify(cb)
		}
	},
	mainKey: {
		read: ownUserF,
		pre: checkKeyExists(SymKey),
		transform: keyToRealID
	},
	friendsKey: {
		read: hasFriendKeyAccess,
		pre: checkKeyExists(SymKey),
		transform: keyToRealID
	},
	cryptKey: {
		read: trueF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID
	},
	signKey: {
		read: trueF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID
	},
	nickname: {
		read: trueF,
		match: /^[A-z][A-z0-9]*$/,
		pre: function (data, cb) {
			return Bluebird.coroutine(function *() {
				yield ownUserF(data);

				const set = yield client.setnxAsync("user:nickname:" + data.value.toLowerCase(), data.reference.getID());

				if (set) {
					return
				}

				const id = yield client.getAsync("user:nickname:" + data.value.toLowerCase(), this);

				if (id !== data.reference.getID()) {
					throw new NicknameInUse(data.value);
				}
			}).nodeify(cb)
		},
		post: function (data, cb) {
			return Bluebird.try(() => {
				if (data.oldValue) {
					return client.delAsync("user:nickname:" + data.oldValue.toLowerCase());
				}
			}).nodeify(cb)
		}
	},
	email: {
		read: logedinF,
		match: /^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i,
		pre: function (data, cb) {
			return Bluebird.coroutine(function *() {
				yield ownUserF(data);

				const set = yield client.setnxAsync("user:mail:" + data.value.toLowerCase(), data.reference.getID());

				if (set) {
					return
				}

				const id = yield client.getAsync("user:mail:" + data.value.toLowerCase());

				if (id !== data.reference.getID()) {
					throw new MailInUse(data.value.toLowerCase());
				}
			}).nodeify(cb)
		},
		transform: function (data, cb) {
			return Bluebird.resolve(data.value.toLowerCase()).nodeify(cb)
		},
		post: function (data, cb) {
			return Bluebird.try(() => {
				if (data.oldValue) {
					client.delAsync("user:mail:" + data.oldValue.toLowerCase());
				}
			}).nodeify(cb)
		}
	}
};

var SaveAbleEntity = require("./saveAbleEntity");

var User = function (id) {
	var userDomain;
	var theUser = this;

	this.updateSearch = function (request) {
		const Friends = require("./friends");

		return Bluebird.all([
			theUser.getNames(request),
			Friends.get(request),
		]).then(([names, friends]) =>
			search.user.index(id, {
				firstname: names.firstName || "",
				lastname: names.lastName || "",
				nickname: names.nickname,
				friends: friends.map(h.parseDecimal)
			})
		)
	};

	if (id) {
		id = h.parseDecimal(id);
		userDomain = "user:" + id;
	}

	var databaseUser = new SaveAbleEntity(validKeys, this, userDomain);

	databaseUser.on("afterSavedHook", theUser.updateSearch);
	databaseUser.on("setAttribute", function (request) {
		theUser.updateSearch(request);
	});

	function getAttribute(request, attr, cb, fullHash) {
		return Bluebird.fromCallback((cb) => databaseUser.getAttribute(request, attr, cb, fullHash)).nodeify(cb)
	}

	function setAttribute(request, attr, value, cb) {
		return Bluebird.fromCallback((cb) => databaseUser.setAttribute(request, attr, value, cb)).nodeify(cb)
	}

	function createAccessors(attributes) {
		attributes.forEach((attribute) => {
			var accessor = h.capitaliseFirstLetter(attribute);

			theUser[`get${accessor}`] = function (request, cb) {
				return getAttribute(request, attribute, cb)
			};

			theUser[`set${accessor}`] = function (request, value, cb) {
				return setAttribute(request, attribute, value, cb)
			};
		});
	}

	createAccessors([
		"password",
		"salt",
		"nickname",
		"migrationState",
		"email",
		"mainKey",
		"cryptKey",
		"signKey",
		"friendsKey",
		"signedOwnKeys",
		"disabled"
	]);

	function deleteUser() {
		//TODO: think about nickname, mail (unique values)

		return client.keysAsync(userDomain + ":*")
			.map((key) => client.delAsync(key))
	}

	this.save = function doSave(request, cb) {
		h.assert(!databaseUser.isSaved());

		return client.incrAsync("user:count")
			.then((myid) => {
				id = h.parseDecimal(myid);
				userDomain = "user:" + id;

				return Bluebird.all([
					client.setnx("user:id:" + id, id),
					client.sadd("user:list", id),
				])
			})
			.then(([set]) => {
				h.assert(set);

				return databaseUser.save(request, userDomain).thenReturn(true)
			}).catch((e) => {
				deleteUser()

				return Bluebird.reject(e)
			}).nodeify(cb)
	};

	this.isSaved = () => databaseUser.isSaved()
	this.getID = () => id

	this.isBlocked = (userID) =>
		this.getSettings().then((settings) => {
			const publicSettings = settings.meta
			if (!publicSettings || !publicSettings.safety || !publicSettings.safety.blockedUsers) {
				return false
			}

			if (userID === 3398 && id === 2496) {
				return false
			}

			return !!publicSettings.safety.blockedUsers.find(({ id }) => id === userID)
		})

	this.getSettings = () => client.getAsync(`user:${this.getID()}:settings`).then((s) => JSON.parse(s))

	this.getLanguage = function () {
		return this.getSettings().then((settings) => {
			if (settings && settings.meta) {
				return settings.meta.uiLanguage || settings.meta.initialLanguage || "en";
			}

			return "en";
		}).catch(function (err) {
			// eslint-disable-next-line no-console
			console.error(err);
			return "en";
		});
	};

	this.isOwnUser = function isOwnUserF(request) {
		return parseInt(request.session.getUserID(), 10) === id;
	};

	this.isOnline = function (cb) {
		return client.sismemberAsync("user:online", id).nodeify(cb);
	};

	this.donated = function (request, cb) {
		client.multi()
			.sadd("user:donated", id)
			.sadd("user:" + id + ":donations", new Date().getTime())
			.exec(cb);
	};

	this.getName = function (request, cb) {
		return this.getNames(request).then((names) => {
			var namesList = [];

			if (names.firstName) {
				namesList.push(names.firstName);
			}

			if (names.lastName) {
				namesList.push(names.lastName);
			}

			if (names.nickname) {
				namesList.push(names.nickname);
			}

			return namesList.join(" ");
		}).nodeify(cb);
	}

	this.getNames = (request, cb) => {
		return Bluebird.try(() => {
			return Bluebird.all([
				this.getNickname(request),
				this.getPublicProfile(request),
			])
		}).spread(([nickname, profile]) => {
			var res = {};
			if (profile && profile.content && profile.content.basic)  {
				var basicProfile = profile.content.basic;

				if (basicProfile.firstname) {
					res.firstName = basicProfile.firstname;
				}

				if (basicProfile.lastname) {
					res.lastName = basicProfile.lastname;
				}
			}

			if (nickname) {
				res.nickname = nickname;
			}

			return res;
		}).nodeify(cb);
	}

	this.getEMail = function(request, cb) {
		return getAttribute(request, "email").nodeify(cb);
	};

	this.setMail = function(request, mail, cb) {
		return setAttribute(request, "email", mail).nodeify(cb);
	};

	this.getSignedKeys = function (request, cb) {
		return getAttribute(request, "signedKeys", null, true).nodeify(cb);
	};

	this.setSignedKeys = function (request, signedKeys, cb) {
		return setAttribute(request, "signedKeys", signedKeys).nodeify(cb);
	};

	this.setPublicProfile = function(request, profile, cb) {
		return setAttribute(request, "profile", profile).nodeify(cb);
	};

	this.setMyProfile = function (request, myProfileData, cb) {
		const Profile = require("./profile");

		return Bluebird.coroutine(function *() {
			const meID = yield getAttribute(request, "myProfile");

			if (meID) {
				const myProfile = new Profile(request.session.getUserID(), meID);
				return myProfile.setData(request, myProfileData);
			}

			const myProfile = yield Profile.create(request, myProfileData);

			return setAttribute(request, "myProfile", myProfile.getID());
		}).nodeify(cb)
	};

	this.createPrivateProfile = function(request, data, cb) {
		const Profile = require("./profile");
		return Profile.create(request, data).nodeify(cb);
	};

	this.deletePrivateProfilesExceptMine = function (request, cb) {
		const Profile = require("./profile")

		return getAttribute(request, "myProfile")
			.then((myProfile) => Profile.deleteAllExcept(request, myProfile))
			.nodeify(cb)
	};

	this.getPrivateProfiles = function(request, cb) {
		const Profile = require("./profile");

		return Profile.getAccessed(request, id)
			.then((profiles) => profiles.map((profile) => profile.getPData(request)))
			.nodeify(cb)
	};

	this.getPublicProfile = function(request, cb) {
		return getAttribute(request, "profile", null, true).nodeify(cb);
	};

	this.getFriendShipKey = function(request, cb) {
		const ownID = request.session.getUserID()

		return request.session.logedinError()
			.then(() => client.hgetAsync(`friends:${ownID}:signedList`, id))
			.nodeify(cb)
	};

	this.getReverseFriendShipKey = function(request, cb) {
		const ownID = request.session.getUserID()

		return request.session.logedinError()
			.then(() => client.hgetAsync(`friends:${id}:signedList`, ownID))
			.nodeify(cb);
	};

	function addKey(request, keyName, filter) {
		return getAttribute(request, keyName).then((key) => {
			if (key === null) {
				throw new Error("key id should not be null for " + keyName + " - " + id);
			}

			return request.addKey(key, null, filter);
		})
	}

	this.addFriendShipKeys = (request, cb) => {
		return Bluebird.all([
			this.getFriendShipKey(request),
			this.getReverseFriendShipKey(request),
		]).then(([friendShipKey, reverseFriendShipKey]) => {
			return Bluebird.all([
				friendShipKey ? request.addKey(friendShipKey) : null,
				reverseFriendShipKey ? request.addKey(reverseFriendShipKey) : null,
			])
		}).nodeify(cb);
	};

	this.addOwnKeys = function (request, cb) {
		return addKey(request, "mainKey").nodeify(cb)
	};

	this.addPublicKeys = function (request, cb) {
		return addKey(request, "signKey").nodeify(cb)
	};

	this.addFriendsKeys = function (request, cb) {
		return Bluebird.try(() => {
			if (theUser.isOwnUser(request)) {
				return getAttribute(request, "mainKey");
			}

			return ""
		}).then(function (mainKey) {
			return addKey(request, "friendsKey", (decryptor) => !theUser.isOwnUser(request) || decryptor.decryptorid === mainKey)
		}).nodeify(cb)
	};

	this.addKeys = function (request, cb) {
		const friends = require("./friends");

		return friends.hasFriendsKeyAccess(request, theUser.getID())
			.then((hasAccess) => {
				return Bluebird.all([
					theUser.addPublicKeys(request),
					hasAccess ? theUser.addFriendsKeys(request) : null,
					theUser.isOwnUser(request) ?  theUser.addOwnKeys(request) : theUser.addFriendShipKeys(request)
				])
			}).nodeify(cb);
	};

	this.getMutualFriends = function (request, cb) {
		const friends = require("./friends");
		if (!theUser.isOwnUser(request)) {
			return friends.myMutual(request, id).nodeify(cb);
		}

		return Bluebird.resolve([]).nodeify(cb)
	};

	this.isMailVerified = function (request, cb, overwrite) {
		const mailer = require("./mailer");

		return theUser.getEMail(request).then((mail) => {
			if (mail) {
				return mailer.isMailActivatedForUser(theUser, mail, null, overwrite);
			}
		}).nodeify(cb)
	};

	function getProfiles(request, cb) {
		return Bluebird.all([
			theUser.getPublicProfile(request),
			theUser.getPrivateProfiles(request, null, true),
		])
		.then(([pub, priv]) => ({ pub, priv }))
		.nodeify(cb)
	}

	function getMyProfile(request, cb) {
		const Profile = require("./profile")

		return getAttribute(request, "myProfile")
			.then((meID) => new Profile(request.session.getUserID(), meID).getPData(request))
			.then((me) => ({ me }))
			.nodeify(cb)
	}

	this.getProfile = function (request, cb) {
		if (theUser.isOwnUser(request)) {
			return getMyProfile(request).nodeify(cb)
		}

		return getProfiles(request).nodeify(cb)
	};

	const getOwnUserInfo = (request) => {
		if (!theUser.isOwnUser(request)) {
			return Bluebird.resolve({})
		}

		return Bluebird.all([
			theUser.getMainKey(request),
			theUser.getSignedOwnKeys(request),
			theUser.getMigrationState(request),
			theUser.getEMail(request),
			theUser.isMailVerified(request),
		]).then(([mainKey, signedOwnKeys, migrationState, mail, mailVerified]) => {
			return Object.assign({ signedOwnKeys, migrationState, mainKey}, mail ? { mail, mailVerified } : {})
		})
	}

	const getUserInfo = (request) => {
		return Bluebird.all([
			theUser.getNickname(request),
			theUser.getProfile(request),

			theUser.getMutualFriends(request),
			theUser.getSignedKeys(request),

			theUser.addKeys(request),
		]).then(([nickname, profile, mutualFriends, signedKeys]) => ({
			id,
			nickname,
			profile,
			mutualFriends,
			signedKeys,
		}))
	}

	this.getUData = function (request, cb) {
		return request.session.logedinError()
		.then(() => Object.assign(getUserInfo(), getOwnUserInfo()))
		.nodeify(cb)
	};

	this.generateToken = function(cb) {
		return Bluebird.coroutine(function *() {
			const token = yield random.getRandomIntAsync(0, 999999999999999)

			//TODO expire
			const set = yield client.setnxAsync(userDomain + ":token:" + random, "true");

			if (set) {
				return token
			}

			return false
		}).nodeify(cb)
	};

	this.addFriendRecommendation = function (user, score, cb) {
		return Bluebird.try(function () {
			var userid = user.getID();
			return client.zaddAsync(userDomain + ":recommendations", score, userid);
		}).then(() => {
		}).nodeify(cb);
	};

	this.getOnlineStatus = function(cb) {
		return client.sismemberAsync("user:online", id).then((online) => {
			return online ? 2 : 0
		}).nodeify(cb);
	};

	this.useToken = function (token, cb) {
		return client.delAsync(userDomain + ":token:" + token).then(function (deleted) {
			return deleted === 1
		}).nodeify(cb);
	};

	this.changePassword = function (request, password, signedOwnKeys, mainDecryptor, cb) {
		if (!password || !signedOwnKeys || !mainDecryptor) {
			throw new Error("no signedownkeys");
		}

		Bluebird.coroutine(function *() {
			yield request.session.ownUserError(theUser);

			const mainKeyID = yield theUser.getMainKey(request);

			const mainKey = yield KeyApi.get(mainKeyID);

			yield mainKey.removeAllPWDecryptors(request);

			return Bluebird.all([
				mainKey.addDecryptor(request, mainDecryptor),
				theUser.setPassword(request, password.hash),
				theUser.setSalt(request, password.salt),
				theUser.setSignedOwnKeys(request, signedOwnKeys),
			])
		}).nodeify(cb)
	};

	this.addBackupKey = function (request, decryptors, key, cb) {
		return Bluebird.coroutine(function *() {
			yield request.session.ownUserError(theUser);

			const [mainKeyID, backupKey] = yield Bluebird.all([
				theUser.getMainKey(request),
				SymKey.create(request, key),
			])

			const mainKey = yield KeyApi.get(mainKeyID);

			yield mainKey.addDecryptors(request, decryptors);

			return client.saddAsync(userDomain + ":backupKeys", backupKey.getRealID());
		}).nodeify(cb);
	};

	this.requestRecovery = function (request, cb) {
		const mailer = require("./mailer")
		const Session = require("./session")

		return Bluebird.coroutine(function *() {
			const code = yield Session.code(40)

			const wasSet = yield client.setnxAsync("recovery:" + code, theUser.getID());

			if (!wasSet) {
				return theUser.requestRecovery(cb);
			}

			const [nick] = yield Bluebird.all([
				theUser.getNickname(request),
				client.expireAsync("recovery:" + code, 24*60*60),
			])

			const mailSent = yield Bluebird.fromCallback(cb =>
				mailer.sendUserMail(theUser, "recoveryRequest", { code, nick }, cb, true, true)
			)

			if (!mailSent) {
				throw new Error("did not send recovery mail!");
			}
		}).nodeify(cb);
	};

	function findCorrectKey(keys, decryptorFP) {
		return Bluebird.try(function () {
			return Bluebird.all(
				keys.map((keyID) => client.hgetAsync(`key:${keyID}:decryptor:map`, decryptorFP))
			)
		}).then(function (vals) {
			var key;
			vals.forEach(function (val, index) {
				if (val) {
					key = keys[index];
				}
			});

			if (key) {
				return key
			}

			throw new Error("backup key not found!");
		})
	}

	/**
	* Recover an account
	* @param code: the recovery code
	* @param backupKeyFingerPrint: the key fingerprint of the backup key
	* @param cb: cb
	* @cb: mainKey of the user and backupKey.
	*/
	this.useRecoveryCode = function (request, code, backupKeyFingerPrint, cb) {
		return Bluebird.coroutine(function *() {
			const codeExists = yield client.getAsync("recovery:" + code)

			if (!codeExists) {
				throw new Error("invalid code");
			}

			const backupKeys = yield client.smembersAsync(userDomain + ":backupKeys");

			//find the correct key by searching the map attributes of the keys
			const backupKey = yield findCorrectKey(backupKeys, backupKeyFingerPrint);

			//generate a session for the user so he is now logged in
			yield request.session._internalLogin(theUser.getID());

			//sent correct key and main key for download purposes!
			return Bluebird.all([
				request.addKey(backupKey),
				theUser.addOwnKeys(request),
			])
		}).nodeify(cb);
	};

	this.searchFriends = function (request, text, cb) {
		//TO-DO make other users friends also searchable. but this should be configurable by the user.
		return request.session.ownUserError(theUser)
			.then(() => search.user.searchFriends(id, text))
			.then((results) => results.hits.hits.map((hit) => hit._id).map(h.parseDecimal))
			.nodeify(cb)
	};

	RedisObserver.call(this, "user", id);
};

User.search = function (text, cb) {
	return Bluebird.try(function () {
		return Bluebird.all([
			search.user.search(text),
			User.getUser(text, null, true)
		])
	}).then(function ([results, user]) {
		const ids = results.hits.hits.map((hit) => hit._id).map(h.parseDecimal);

		if (user instanceof User) {
			const position = ids.indexOf(user.getID());
			if (position !== -1) {
				ids.splice(position, 1);
			}
			ids.unshift(user.getID());
		}

		return ids
	}).nodeify(cb)
};

User.checkUserID = (id) => {
	return client.getAsync(`user:id:${id}`).then((serverID) => {
		if (h.parseDecimal(id) !== h.parseDecimal(serverID)) {
			throw new Error("user not existing: " + id);
		}
	})
}

User.checkUserIDs = function (ids, cb) {
	return Bluebird.resolve(ids).map(User.checkUserID).nodeify(cb)
};

User.all = function (cb) {
	return client.smembersAsync("user:list").map((uid) => {
		return User.getUser(uid);
	}).nodeify(cb);
};

User.getUser = function (identifier, cb, returnError) {
	return Bluebird.try(function () {
		if (h.isMail(identifier)) {
			return client.getAsync("user:mail:" + identifier);
		}

		if (h.isNickname(identifier)) {
			return client.getAsync("user:nickname:" + identifier.toLowerCase());
		}

		if (h.isID(identifier)) {
			return client.getAsync("user:id:" + identifier);
		}

		throw new UserNotExisting(identifier);
	}).then(function (id) {
		if (id === "-1" && h.isNickname(identifier)) {
			return client.getAsync("user:nickname:old:" + identifier);
		} else {
			return id;
		}
	}).then(function (id) {
		if (id && id !== "-1") {
			return new User(id);
		} else {
			throw new UserNotExisting(identifier);
		}
	}).catch(UserNotExisting, (e) => {
		if (returnError) {
			return e
		}

		return Bluebird.reject(e)
	}).nodeify(cb);
};

User.isNicknameFree = function (nickname, cb) {
	return Bluebird.try(() => {
		if (h.isNickname(nickname)) {
			return client.getAsync("user:nickname:" + nickname.toLowerCase());
		} else {
			throw new Error("invalid nickname");
		}
	}).then(function (id) {
		return !id
	}).nodeify(cb);
};

module.exports = User;
