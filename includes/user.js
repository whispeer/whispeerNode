"use strict";

/* @refactor */
//this code is totally slugish
//it needs a BIG refactoring!
//first of all: uniquify all keys in one hset
//second of all: define key visibility in an easier way!

const Bluebird = require("bluebird")
const step = require("step");
const client = require("./redisClient");
const h = require("whispeerHelper");

const search = require("./search");

const EccKey = require("./crypto/eccKey");
const SymKey = require("./crypto/symKey");

const KeyApi = require("./crypto/KeyApi");

const RedisObserver = require("./asset/redisObserver");

function logedinF(data, cb) {
	return Bluebird.try(() => {
		if (data.reference.isSaved()) {
			return data.request.session.logedinError();
		}
	}).nodeify(cb);
}

function ownUserF(data, cb) {
	return Bluebird.try(() => {
		if (data.reference.isSaved()) {
			return data.request.session.ownUserError(data.reference);
		}
	}).nodeify(cb)
}

function hasFriendKeyAccess(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(data.request, data.reference.getID(), this);
		} else {
			this.last.ne();
		}
	}, h.sF(function (acc) {
		if (!acc) {
			throw new AccessViolation("No Key Access");
		}

		this.ne();
	}), cb);
}

function trueF(data, cb) {
	cb();
}

function checkKeyExists(keyObj) {
	return function (data, cb) {
		step(function () {
			if (typeof data.value === "object" && data.value instanceof keyObj) {
				this.last.ne();
			} else {
				keyObj.get(data.value, this);
			}
		}, h.sF(function () {
			this.ne();
		}), cb);
	};
}

function keyToRealID(data, cb) {
	step(function () {
		if (typeof data.value === "object" && typeof data.value.getRealID === "function") {
			this.ne(data.value.getRealID());
		} else {
			this.ne(data.value);
		}
	}, cb);
}

var validKeys = {
	myProfile: {
		read: ownUserF,
		pre: ownUserF
	},
	profile: {
		read: logedinF,
		readTransform: function (data, cb) {
			step(function () {
				var val = data.value, attr;

				for (attr in val) {
					if (val.hasOwnProperty(attr)) {
						val[attr] = JSON.parse(val[attr]);
					}
				}

				this.ne(val);
			}, cb);
		},
		pre: function (data, cb) {
			step(function () {
				var validator = require("whispeerValidations");
				var err = validator.validate("profile", data);
				if (err) {
					throw err;
				} else {
					this.ne();
				}
			}, cb);
		},
		transform: function (data, cb) {
			var val = data.value;
			step(function () {
				var attr;
				for (attr in val) {
					if (val.hasOwnProperty(attr)) {
						val[attr] = JSON.stringify(val[attr]);
					}
				}

				this.ne(val);
			}, cb);
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
			cb(null, JSON.stringify(data.value));
		},
		readTransform: function (data, cb) {
			cb(null, JSON.parse(data.value));
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
			step(function () {
				ownUserF(data, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + data.value.toLowerCase(), data.reference.getID(), this);
			}), h.sF(function (set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:nickname:" + data.value.toLowerCase(), this);
				}
			}), h.sF(function (id) {
				if (id === data.reference.getID()) {
					this.last.ne();
				} else {
					throw new NicknameInUse(data.value);
				}
			}), cb);
		},
		post: function (data, cb) {
			step(function () {
				if (data.oldValue) {
					client.del("user:nickname:" + data.oldValue.toLowerCase());
				}

				this.ne();
			}, cb);
		}
	},
	email: {
		read: logedinF,
		match: /^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i,
		pre: function (data, cb) {
			step(function mailPre1() {
				ownUserF(data, this);
			}, h.sF(function mailPre2() {
				client.setnx("user:mail:" + data.value.toLowerCase(), data.reference.getID(), this);
			}), h.sF(function mailPre3(set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:mail:" + data.value.toLowerCase(), this);
				}
			}), h.sF(function mailPre4(id) {
				if (id === data.reference.getID()) {
					this.last.ne();
				} else {
					throw new MailInUse(data.value.toLowerCase());
				}
			}), cb);
		},
		transform: function mailT1(data, cb) {
			step(function () {
				this.ne(data.value.toLowerCase());
			}, cb);
		},
		post: function (data, cb) {
			step(function mailP1() {
				if (data.oldValue) {
					client.del("user:mail:" + data.oldValue.toLowerCase());
				}
				this.ne();
			}, cb);
		}
	}
};

var SaveAbleEntity = require("./saveAbleEntity");

var User = function (id) {
	var userDomain;
	var theUser = this;

	this.updateSearch = function (request) {
		var Friends = require("./friends");

		step(function () {
			this.parallel.unflatten();

			theUser.getNames(request, this.parallel());
			Friends.get(request, this.parallel());
		}, h.sF(function (names, friends) {
			search.user.index(id, {
				firstname: names.firstName || "",
				lastname: names.lastName || "",
				nickname: names.nickname,
				friends: friends.map(h.parseDecimal)
			});
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
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

	function deleteUser(cb) {
		//TODO: think about nickname, mail (unique values)

		return client.keysAsync(userDomain + ":*").map((key) => {
			return client.delAsync(key);
		}).nodeify(cb);
	}

	this.save = function doSave(request, cb) {
		h.assert(!databaseUser.isSaved());

		step(function doSave() {
			return client.incrAsync("user:count");
		}, h.sF(function handleNewID(myid) {
			id = h.parseDecimal(myid);
			userDomain = "user:" + id;

			this.parallel.unflatten();

			return Bluebird.all([
				client.setnx("user:id:" + id, id),
				client.sadd("user:list", id),
			])
		}), h.sF(function ([set]) {
			h.assert(set);

			databaseUser.save(request, userDomain, this);
		}), function saveDone(e) {
			if (e) {
				deleteUser(function (e) {
					console.error(e);
				});

				throw e;
			}

			this.ne(true);
		}, cb);
	};

	this.isSaved = function() {
		return databaseUser.isSaved();
	};

	this.getID = () => id

	this.isBlocked = (userID) =>
		this.getSettings().then((settingsString) => {
			const settings = JSON.parse(settingsString)
			if (!settings.safety || !settings.safety.blockedUsers) {
				return false
			}

			return !!settings.safety.blockedUsers.find(({ id }) => id === userID)
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
		}).spread((nickname, profile) => {
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
		step(function () {
			return getAttribute(request, "myProfile");
		}, h.sF(function (meID) {
			var Profile = require("./profile");
			if (meID) {
				var myProfile = new Profile(request.session.getUserID(), meID);
				myProfile.setData(request, myProfileData, this.last);
			} else {
				Profile.create(request, myProfileData, this);
			}
		}), h.sF(function (myProfile) {
			setAttribute(request, "myProfile", myProfile.getID(), this);
		}), cb);
	};

	this.createPrivateProfile = function(request, data, cb) {
		var Profile = require("./profile");
		Profile.create(request, data, cb);
	};

	this.deletePrivateProfilesExceptMine = function (request, cb) {
		step(function () {
			return getAttribute(request, "myProfile");
		}, h.sF(function (myProfile) {
			require("./profile").deleteAllExcept(request, myProfile, this);
		}), cb);
	};

	this.getPrivateProfiles = function(request, cb) {
		step(function getPP1() {
			var Profile = require("./profile");
			Profile.getAccessed(request, id, this);
		}, h.sF(function getPP2(profiles) {
			profiles.forEach(function (profile) {
				profile.getPData(request, this.parallel());
			}, this);

			this.parallel()();
		}), cb);
	};

	this.getPublicProfile = function(request, cb) {
		return getAttribute(request, "profile", null, true).nodeify(cb);
	};

	this.getFriendShipKey = function(request, cb) {
		return request.session.logedinError().then(() => {
			return client.hgetAsync("friends:" + request.session.getUserID() + ":signedList", id);
		}).nodeify(cb);
	};

	this.getReverseFriendShipKey = function(request, cb) {
		return request.session.logedinError(this).then(() => {
			return client.hgetAsync(`friends:${id}:signedList`, request.session.getUserID());
		}).nodeify(cb);
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
		step(function () {
			if (theUser.isOwnUser(request)) {
				return getAttribute(request, "mainKey");
			} else {
				this.ne("");
			}
		}, h.sF(function (mainKey) {
			return addKey(request, "friendsKey", function (decryptor) {
				return !theUser.isOwnUser(request) || decryptor.decryptorid === mainKey;
			});
		}), cb);

	};

	this.addKeys = function (request, cb) {
		step(function () {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(request, theUser.getID(), this);
		}, h.sF(function (hasAccess) {
			theUser.addPublicKeys(request, this.parallel());

			if (hasAccess) {
				theUser.addFriendsKeys(request, this.parallel());
			}

			if (theUser.isOwnUser(request)) {
				theUser.addOwnKeys(request, this.parallel());
			} else {
				theUser.addFriendShipKeys(request, this.parallel());
			}
		}), cb);
	};

	this.getMutualFriends = function (request, cb) {
		var friends = require("./friends");
		if (theUser.isOwnUser(request)) {
			cb(null, []);
		} else {
			friends.myMutual(request, id, cb);
		}
	};

	this.isMailVerified = function (request, cb, overwrite) {
		step(function () {
			theUser.getEMail(request, this);
		}, h.sF(function (mail) {
			if (mail) {
				var mailer = require("./mailer");
				mailer.isMailActivatedForUser(theUser, mail, this, overwrite);
			} else {
				this.ne();
			}
		}), cb);
	};

	this.check = function (errors, cb) {
		var friends = require("./friends");
		return Bluebird.fromCallback((cb) => friends.checkSignedList(errors, this.getID(), cb)).nodeify(cb);
	};

	function getProfiles(request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getPublicProfile(request, this.parallel());
			theUser.getPrivateProfiles(request, this.parallel(), true);
		}, h.sF(function (pub, priv) {
			this.ne({
				pub: pub,
				priv: priv
			});
		}), cb);
	}

	function getMyProfile(request, cb) {
		step(function () {
			return getAttribute(request, "myProfile");
		}, h.sF(function (meID) {
			var Profile = require("./profile");
			new Profile(request.session.getUserID(), meID).getPData(request, this);
		}), h.sF(function (me) {
			this.ne({
				me: me
			});
		}), cb);
	}

	this.getProfile = function (request, cb) {
		if (theUser.isOwnUser(request)) {
			getMyProfile(request, cb);
		} else {
			getProfiles(request, cb);
		}
	};

	this.getUData = function (request, cb) {
		var result;
		step(function () {
			return request.session.logedinError();
		}, h.sF(function () {
			this.parallel.unflatten();

			theUser.getNickname(request, this.parallel());
			theUser.getProfile(request, this.parallel());

			theUser.getMutualFriends(request, this.parallel());
			theUser.getSignedKeys(request, this.parallel());

			if (theUser.isOwnUser(request)) {
				theUser.getMainKey(request, this.parallel());
				theUser.getSignedOwnKeys(request, this.parallel());
				theUser.getMigrationState(request, this.parallel());
				theUser.getEMail(request, this.parallel());
				theUser.isMailVerified(request, this.parallel());
			}

			theUser.addKeys(request, this.parallel());
		}), h.sF(function (nick, profile, mutualFriends, signedKeys, mainKey, signedOwnKeys, migrationState, mail, mailVerified) {
			result = {
				id: id,
				nickname: nick,
				profile: profile,
				signedKeys: signedKeys
			};

			if (theUser.isOwnUser(request)) {
				result.signedOwnKeys = signedOwnKeys;
				result.migrationState = migrationState;
				result.mainKey = mainKey;
				if (mail) {
					result.mail = mail;
					result.mailVerified = mailVerified;
				}
			}

			result.mutualFriends = mutualFriends;

			this.last.ne(result);
		}), cb);
	};

	this.generateToken = function(cb) {
		var token;
		step(function () {
			var random = require("secure_random");
			random.getRandomInt(0, 999999999999999, this);
		}, h.sF(function (random) {
			token = random;
			//TODO expire
			//client.set(userDomain + ":token:" + random, 'true', 'NX', 'EX', 60 * 5, this);
			return client.setnxAsync(userDomain + ":token:" + random, "true");
		}), h.sF(function (set) {
			if (set) {
				this.ne(token);
			} else {
				this.ne(false);
			}
		}), cb);
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

		var mainKey;
		step(function () {
			return request.session.ownUserError(theUser);
		}, h.sF(function () {
			theUser.getMainKey(request, this);
		}), h.sF(function (mainKey) {
			return KeyApi.get(mainKey);
		}), h.sF(function (_mainKey) {
			mainKey = _mainKey;
			return mainKey.removeAllPWDecryptors(request);
		}), h.sF(function () {
			mainKey.addDecryptor(request, mainDecryptor, this.parallel());
			theUser.setPassword(request, password.hash, this.parallel());
			theUser.setSalt(request, password.salt, this.parallel());

			theUser.setSignedOwnKeys(request, signedOwnKeys, this.parallel());
		}), cb);
	};

	this.addBackupKey = function (request, decryptors, key, cb) {
		var backupKey;
		step(function () {
			return request.session.ownUserError(theUser);
		}, h.sF(function () {
			//get main key!
			this.parallel.unflatten();
			theUser.getMainKey(request, this.parallel());
			SymKey.create(request, key, this.parallel());
		}), h.sF(function (mainKey, _backupKey) {
			backupKey = _backupKey;
			return KeyApi.get(mainKey);
		}), h.sF(function (mainKey) {
			return mainKey.addDecryptors(request, decryptors);
		}), h.sF(function () {
			return client.saddAsync(userDomain + ":backupKeys", backupKey.getRealID());
		}), cb);
	};

	this.requestRecovery = function (request, cb) {
		var mailer = require("./mailer"), Session = require("./session"), code;
		step(function () {
			Session.code(40, this);
		}, h.sF(function (_code) {
			code = _code;
			client.setnx("recovery:" + code, theUser.getID(), this);
		}), h.sF(function (wasSet) {
			if (wasSet) {
				this.parallel.unflatten();
				theUser.getNickname(request, this.parallel());
				client.expire("recovery:" + code, 24*60*60, this.parallel());
			} else {
				theUser.requestRecovery(cb);
			}
		}), h.sF(function (nick) {
			mailer.sendUserMail(theUser, "recoveryRequest", {
				code: code,
				nick: nick
			}, this, true, true);
		}), h.sF(function (mailSent) {
			if (!mailSent) {
				throw new Error("did not send recovery mail!");
			}

			this.ne();
		}), cb);
	};

	function findCorrectKey(keys, decryptorFP, cb) {
		step(function () {
			keys.forEach(function (keyID) {
				client.hget("key:" + keyID + ":decryptor:map", decryptorFP, this.parallel());
			}, this);
		}, h.sF(function (vals) {
			var key;
			vals.forEach(function (val, index) {
				if (val) {
					key = keys[index];
				}
			}, this);

			if (key) {
				this.ne(key);
			} else {
				throw new Error("backup key not found!");
			}
		}), cb);
	}

	/**
	* Recover an account
	* @param code: the recovery code
	* @param backupKeyFingerPrint: the key fingerprint of the backup key
	* @param cb: cb
	* @cb: mainKey of the user and backupKey.
	*/
	this.useRecoveryCode = function (request, code, backupKeyFingerPrint, cb) {
		var backupKey;

		step(function () {
			client.get("recovery:" + code, this);
		}, h.sF(function (codeExists) {
			if (codeExists) {
				client.smembers(userDomain + ":backupKeys", this);
			} else {
				throw new Error("invalid code");
			}
		}), h.sF(function (backupKeys) {
			//find the correct key by searching the map attributes of the keys
			findCorrectKey(backupKeys, backupKeyFingerPrint, this);
		}), h.sF(function (_backupKey) {
			backupKey = _backupKey;
			//generate a session for the user so he is now logged in
			return request.session._internalLogin(theUser.getID());
		}), h.sF(function () {
			//sent correct key and main key for download purposes!
			return Bluebird.all([
				request.addKey(backupKey),
				theUser.addOwnKeys(request),
			])

			//receive password change request hopefully
		}), cb);
	};

	this.searchFriends = function (request, text, cb) {
		step(function () {
			//TO-DO make other users friends also searchable. but this should be configurable by the user.
			request.session.ownUserError(theUser, this);
		}, h.sF(function () {
			search.user.searchFriends(id, text, this);
		}), h.sF(function (results) {
			var ids = results.hits.hits.map(function (hit) {
				return hit._id;
			});

			ids = ids.map(h.parseDecimal);

			this.ne(ids);
		}), cb);
	};

	RedisObserver.call(this, "user", id);
};

User.search = function (text, cb) {
	step(function () {
		this.parallel.unflatten();

		search.user.search(text, this.parallel());
		User.getUser(text, this.parallel(), true);
	}, h.sF(function (results, user) {
		var ids = results.hits.hits.map(function (hit) {
			return hit._id;
		});

		ids = ids.map(h.parseDecimal);

		var position;
		if (user instanceof User) {
			position = ids.indexOf(user.getID());
			if (position !== -1) {
				ids.splice(position, 1);
			}
			ids.unshift(user.getID());
		}

		this.ne(ids);
	}), cb);
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

User.check = function (errors, cb) {
	return User.all().map(function (user) {
		return user.check(errors);
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
