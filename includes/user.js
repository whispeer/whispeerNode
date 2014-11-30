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
		read: logedinF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID
	},
	signKey: {
		read: logedinF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID
	},
	nickname: {
		read: logedinF,
		match: /^[A-z][A-z0-9]*$/,
		pre: function (data, cb) {
			step(function nPre1() {
				ownUserF(data, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + data.value, data.reference.getID(), this);
			}), h.sF(function nPre2(set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:nickname:" + data.value, this);
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
					client.del("user:nickname:" + data.oldValue);
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
	databaseUser.on("setAttribute", function (request, field) {
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

	this.isOwnUser = function isOwnUserF(request) {
		return parseInt(request.session.getUserID(), 10) === id;
	};

	this.isOnline = function isOnlineF(cb) {
		client.sismember("user:online", id, cb);
	};

	function getNameF(request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getNickname(request, this.parallel());
			theUser.getPublicProfile(request, this.parallel());
		}, h.sF(function (nickname, profile) {
			var res = [], name;
			if (profile && profile.content && profile.content.basic)  {
				var basicProfile = profile.content.basic;

				if (basicProfile.firstname) {
					res.push(basicProfile.firstname);
				}

				if (basicProfile.lastname) {
					res.push(basicProfile.lastname);
				}
			}

			if (nickname) {
				res.push(nickname);
			}

			name = res.join(" ");

			this.ne(name);
		}), cb);
	}

	this.getName = getNameF;

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

	function addArrayKeys(request, arr, cb) {
		step(function () {
			arr.forEach(function (keyName) {
				getAttribute(request, keyName, this.parallel());
			}, this);
		}, h.sF(function (keys) {
			keys.forEach(function (key) {
				request.addKey(key, this.parallel());
			}, this);
		}), cb);
	}

	this.addFriendShipKeys = function (request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getFriendShipKey(request, this.parallel());
			theUser.getReverseFriendShipKey(request, this.parallel());
		}, h.sF(function (friendShipKey, reverseFriendShipKey) {
			var result = {};

			if (friendShipKey) {
				request.addKey(friendShipKey, this);
			}

			if (reverseFriendShipKey) {
				request.addKey(reverseFriendShipKey, this);
			}

			this.ne(result);
		}), cb);
	};

	var ownKeys = ["mainKey"];
	this.addOwnKeys = function (request, cb) {
		addArrayKeys(request, ownKeys, cb);
	};

	var publicKeys = ["cryptKey", "signKey"];
	this.addPublicKeys = function (request, cb) {
		addArrayKeys(request, publicKeys, cb);
	};

	var friendsKeys = ["friendsKey"];
	this.addFriendsKeys = function (request, cb) {
		addArrayKeys(request, friendsKeys, cb);
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

	this.isMailVerified = function (request, cb) {
		step(function () {
			theUser.getEMail(request, this);
		}, h.sF(function (mail) {
			if (mail) {
				var mailer = require("./mailer");
				mailer.isMailActivatedForUser(theUser, mail, this);
			} else {
				this.ne();
			}
		}), cb);
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

	this.getOnlineStatus = function(cb) {
		step(function () {
			client.scard(userDomain + ":sockets", this.parallel());
			client.get(userDomain + ":recentActivity", this.parallel());
		}, h.sF(function (socketCount, activity) {
			if (socketCount > 0) {
				if (activity) {
					this.ne(2);
				} else {
					this.ne(1);
				}
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

	RedisObserver.call(this, "user", id);
};

User.search = function (text, cb) {
	step(function () {
		this.parallel.unflatten();
		search.user.type("and").query(text, this.parallel());
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

User.getUser = function (identifier, callback, returnError) {
	step(function () {
		if (h.isMail(identifier)) {
			client.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			client.get("user:nickname:" + identifier, this);
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
		if (id) {
			this.ne(new User(id));
		} else {
			if (returnError) {
				this.ne(new UserNotExisting(identifier));
			} else {
				throw new UserNotExisting(identifier);
			}
		}
	}), callback);
};

module.exports = User;