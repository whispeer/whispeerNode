"use strict";

/* @refactor */
//this code is totally slugish
//it needs a BIG refactoring!
//first of all: uniquify all keys in one hset
//second of all: define key visibility in an easier way!

var step = require("step");
var client = require("./redisClient");
var h = require("whispeerHelper");

var search = require("./search");

var EccKey = require("./crypto/eccKey");
var SymKey = require("./crypto/symKey");

var KeyApi = require("./crypto/KeyApi");

var RedisObserver = require("./asset/redisObserver");

function logedinF(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			data.request.session.logedinError(this);
		} else {
			this.ne();
		}
	}, cb);
}

function ownUserF(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			data.request.session.ownUserError(data.reference, this);
		} else {
			this.ne();
		}
	}, cb);
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
			step(function nPre1() {
				ownUserF(data, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + data.value.toLowerCase(), data.reference.getID(), this);
			}), h.sF(function nPre2(set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:nickname:" + data.value.toLowerCase(), this);
				}
			}), h.sF(function nPre3(id) {
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

	function updateSearch(request) {
		step(function () {
			this.parallel.unflatten();
			theUser.getName(request, this);
		}, h.sF(function (name) {
			search.user.index(name, id);
			//TO-DO: search.friendsSearch(request).updateOwn(friends, name);
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
	}

	if (id) {
		id = h.parseDecimal(id);
		userDomain = "user:" + id;
	}

	var databaseUser = new SaveAbleEntity(validKeys, this, userDomain);

	databaseUser.on("afterSavedHook", updateSearch);
	databaseUser.on("setAttribute", function (request) {
		updateSearch(request);
	});

	function getAttribute(request, attr, cb, fullHash) {
		databaseUser.getAttribute(request, attr, cb, fullHash);
	}

	function setAttribute(request, attr, value, cb) {
		databaseUser.setAttribute(request, attr, value, cb);
	}

	function createAccessors(attributes) {
		attributes.forEach(function (attribute) {
			var accessor = h.capitaliseFirstLetter(attribute);

			theUser["get" + accessor] = function getAttribute(request, cb) {
				databaseUser.getAttribute(request, attribute, cb);
			};

			theUser["set" + accessor] = function setAttribute(request, value, cb) {
				databaseUser.setAttribute(request, attribute, value, cb);
			};
		});
	}

	createAccessors(["password", "salt", "nickname", "migrationState", "email",
					"mainKey", "cryptKey", "signKey", "friendsKey", "signedOwnKeys"]);

	function deleteUser(cb) {
		//TODO: think about nickname, mail (unique values)
		step(function () {
			client.keys(userDomain + ":*", this);
		}, h.sF(function (keys) {
			keys.forEach(function (key) {
				client.del(key, this.parallel());
			}, this);
		}), cb);
	}

	this.save = function doSave(request, cb) {
		h.assert(!databaseUser.isSaved());

		step(function doSave() {
			client.incr("user:count", this);
		}, h.sF(function handleNewID(myid) {
			id = h.parseDecimal(myid);
			userDomain = "user:" + id;

			this.parallel.unflatten();

			client.setnx("user:id:" + id, id, this.parallel());
			client.sadd("user:list", id, this.parallel());
		}), h.sF(function (set) {
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

	this.getID = function() {
		return id;
	};

	this.getLanguage = function () {
		return client.getAsync("user:" + this.getID() + ":settings").then(function (settings) {
			if (settings && settings.meta) {
				return settings.meta.uiLanguage || settings.meta.initialLanguage;
			}

			return "en";
		});
	};

	this.isOwnUser = function isOwnUserF(request) {
		return parseInt(request.session.getUserID(), 10) === id;
	};

	this.isOnline = function isOnlineF(cb) {
		client.sismember("user:online", id, cb);
	};

	this.donated = function (request, cb) {
		client.multi()
			.sadd("user:donated", id)
			.sadd("user:" + id + ":donations", new Date().getTime())
			.exec(cb);
	};

	function getNamesF(request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getNickname(request, this.parallel());
			theUser.getPublicProfile(request, this.parallel());
		}, h.sF(function (nickname, profile) {
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

			this.ne(res);
		}), cb);		
	}

	function getNameF(request, cb) {
		step(function () {
			theUser.getNames(request, this);
		}, h.sF(function (names) {
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

			this.ne(namesList.join(" "));
		}), cb);
	}

	this.getName = getNameF;
	this.getNames = getNamesF;

	this.getEMail = function(request, cb) {
		step(function () {
			getAttribute(request, "email", this);
		}, cb);
	};

	this.setMail = function(request, mail, cb) {
		step(function doSetMail() {
			setAttribute(request, "email", mail, this);
		}, cb);
	};

	this.getSignedKeys = function (request, cb) {
		getAttribute(request, "signedKeys", cb, true);
	};

	this.setSignedKeys = function (request, signedKeys, cb) {
		setAttribute(request, "signedKeys", signedKeys, cb);
	};

	this.setPublicProfile = function(request, profile, cb) {
		setAttribute(request, "profile", profile, cb);
	};

	this.setMyProfile = function (request, myProfileData, cb) {
		step(function () {
			getAttribute(request, "myProfile", this);
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
			getAttribute(request, "myProfile", this);
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
		step(function doGetPublicProfile() {
			getAttribute(request, "profile", this, true);
		}, cb);
	};

	this.getFriendShipKey = function(request, cb) {
		step(function getFSKF() {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.hget("friends:" + request.session.getUserID() + ":signedList", id, this);
		}), cb);
	};

	this.getReverseFriendShipKey = function(request, cb) {
		step(function getFSKF() {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.hget("friends:" + id + ":signedList", request.session.getUserID(), this);
		}), cb);
	};

	function addKey(request, keyName, cb, filter) {
		step(function () {
			getAttribute(request, keyName, this);
		}, h.sF(function (key) {
			if (key === null) {
				throw new Error("key id should not be null for " + keyName + " - " + id);
			}

			request.addKey(key, this, filter);
		}), cb);
	}

	this.addFriendShipKeys = function (request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getFriendShipKey(request, this.parallel());
			theUser.getReverseFriendShipKey(request, this.parallel());
		}, h.sF(function (friendShipKey, reverseFriendShipKey) {
			if (friendShipKey) {
				request.addKey(friendShipKey, this.parallel());
			}

			if (reverseFriendShipKey) {
				request.addKey(reverseFriendShipKey, this.parallel());
			}

			this.parallel()();
		}), cb);
	};

	this.addOwnKeys = function (request, cb) {
		addKey(request, "mainKey", cb, function (decryptor) {
			return decryptor.type === "pw";
		});
	};

	this.addPublicKeys = function (request, cb) {
		addKey(request, "signKey", cb);
	};

	this.addFriendsKeys = function (request, cb) {
		step(function () {
			if (theUser.isOwnUser(request)) {
				getAttribute(request, "mainKey", this);
			} else {
				this.ne("");
			}
		}, h.sF(function (mainKey) {
			addKey(request, "friendsKey", this, function (decryptor) {
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

	this.searchFriends = function (request, text, cb) {
		step(function () {
			//TO-DO make other users friends also searchable. but this should be configurable by the user.
			request.session.ownUserError(theUser, this);
		}, h.sF(function () {
			var fSearch = new search.friendsSearch(id);
			fSearch.findFriend(text, this);
		}), h.sF(function (ids) {
			this.ne(ids);
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
		friends.checkSignedList(errors, this.getID(), cb);
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
			getAttribute(request, "myProfile", this);
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
			request.session.logedinError(this);
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
			client.setnx(userDomain + ":token:" + random, "true", this);
		}), h.sF(function (set) {
			if (set) {
				this.ne(token);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	this.addFriendRecommendation = function (user, score, cb) {
		step(function () {
			var userid = user.getID();
			client.zadd(userDomain + ":recommendations", score, userid, this);
		}, h.sF(function () {
			this.ne();
		}), cb);
	};

	this.getOnlineStatus = function(cb) {
		step(function () {
			client.sismember("user:online", id, this.parallel());
		}, h.sF(function (online) {
			if (online) {
				this.ne(2);
			} else {
				this.ne(0);
			}
		}), cb);
	};

	this.useToken = function useTokenF(token, cb) {
		step(function () {
			client.del(userDomain + ":token:" + token, this);
		}, h.sF(function (deleted) {
			if (deleted === 1) {
				this.ne(true);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	this.changePassword = function (request, password, signedOwnKeys, mainDecryptor, cb) {
		var mainKey;
		step(function () {
			request.session.ownUserError(theUser, this);
		}, h.sF(function () {
			theUser.getMainKey(request, this);
		}), h.sF(function (mainKey) {
			KeyApi.get(mainKey, this);
		}), h.sF(function (_mainKey) {
			mainKey = _mainKey;
			mainKey.removeAllPWDecryptors(request, this);
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
			request.session.ownUserError(theUser, this);
		}, h.sF(function () {
			//get main key!
			this.parallel.unflatten();
			theUser.getMainKey(request, this.parallel());
			SymKey.createWDecryptors(request, key, this.parallel());
		}), h.sF(function (mainKey, _backupKey) {
			backupKey = _backupKey;
			KeyApi.get(mainKey, this);
		}), h.sF(function (mainKey) {
			mainKey.addDecryptors(request, decryptors, this);
		}), h.sF(function () {
			client.sadd(userDomain + ":backupKeys", backupKey.getRealID(), this);
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
			request.session._internalLogin(theUser.getID(), this);
		}), h.sF(function () {
			//sent correct key and main key for download purposes!
			request.addKey(backupKey, this.parallel());
			theUser.addOwnKeys(request, this.parallel());
			
			//receive password change request hopefully
		}), cb);
	};

	RedisObserver.call(this, "user", id);
};

User.search = function (text, cb) {
	step(function () {
		this.parallel.unflatten();
		if (text.length > 2) {
			search.user.type("and").query(text, this.parallel());
		}
		this.parallel()(null, []);
		User.getUser(text, this.parallel(), true);
	}, h.sF(function (ids, user) {
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

User.checkUserIDs = function (ids, cb) {
	step(function () {
		ids = ids.map(h.parseDecimal);
		ids.forEach(function (id) {
			client.get("user:id:" + id, this.parallel());
		}, this);
	}, h.sF(function (serverIDs) {
		serverIDs = serverIDs.map(h.parseDecimal);
		ids.forEach(function (id, index) {
			if (id !== serverIDs[index]) {
				throw new Error("user not existing: " + id);
			}
		});

		this.ne();
	}), cb);
};

User.all = function (cb) {
	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (uids) {
		uids.forEach(function (uid) {
			User.getUser(uid, this.parallel());
		}, this);
	}), cb);
};

User.check = function (errors, cb) {
	step(function () {
		User.all(this);
	}, h.sF(function (users) {
		users.forEach(function (user) {
			user.check(errors, this.parallel());
		}, this);

		this.parallel()();
	}), cb);
};

User.getUser = function (identifier, callback, returnError) {
	step(function () {
		if (h.isMail(identifier)) {
			client.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			client.get("user:nickname:" + identifier.toLowerCase(), this);
		} else if (h.isID(identifier)) {
			client.get("user:id:" + identifier, this);
		} else {
			if (returnError) {
				this.last.ne(new UserNotExisting(identifier));
			} else {
				throw new UserNotExisting(identifier);
			}
		}
	}, h.sF(function (id) {
		if (id === "-1" && h.isNickname(identifier)) {
			client.get("user:nickname:old:" + identifier, this);
		} else {
			this.ne(id);
		}
	}), h.sF(function (id) {
		if (id && id !== "-1") {
			this.last.ne(new User(id));
		} else {
			if (returnError) {
				this.ne(new UserNotExisting(identifier));
			} else {
				throw new UserNotExisting(identifier);
			}
		}
	}), callback);
};

User.isNicknameFree = function (nickname, cb) {
	step(function () {
		if (h.isNickname(nickname)) {
			client.get("user:nickname:" + nickname.toLowerCase(), this);
		} else {
			throw new Error("invalid nickname");
		}
	}, h.sF(function (id) {
		this.ne(!id);
	}), cb);
};

module.exports = User;
