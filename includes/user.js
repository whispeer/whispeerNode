"use strict";

/* @refactor */
//this code is totally slugish
//it needs a BIG refactoring!
//first of all: uniquify all keys in one hset
//second of all: define key visibility in an easier way!

var step = require("step");
var client = require("./redisClient");
var h = require("whispeerHelper");
var extend = require("xtend");

var search = require("./search");
var KeyApi = require("./crypto/KeyApi");

var EccKey = require("./crypto/eccKey");
var SymKey = require("./crypto/symKey");

var UPDATESEARCHON = ["profile", "nickname"];

function logedinF(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			data.view.logedinError(this);
		} else {
			this.ne();
		}
	}, cb);
}

function ownUserF(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			data.view.ownUserError(data.reference, this);
		} else {
			this.ne();
		}
	}, cb);
}

function hasFriendKeyAccess(data, cb) {
	step(function () {
		if (data.reference.isSaved()) {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(data.view, data.reference.getID(), this);
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
	profile: {
		read: logedinF,
		readTransform: function (data, cb) {
			step(function () {
				var attr;
				for (attr in data) {
					if (data.hasOwnProperty(attr)) {
						data[attr] = JSON.parse(data[attr]);
					}
				}

				this.ne(data);
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
		match: /^[A-Fa-f0-9]{10}$/,
		pre: ownUserF
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
	friendsLevel2Key: {
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

function key2obj(key) {
	if (typeof key === "string") {
		return key.split(":");
	}

	return key;
}

function obj2key(key) {
	if (typeof key === "string") {
		return key;
	}

	return key.join(":");
}

function validKey(key) {
	if (typeof key === "string") {
		key = key2obj(key);
	}

	var cur = validKeys;

	var i;
	for (i = 0; i < key.length; i += 1) {
		if (cur[key[i]]) {
			cur = cur[key[i]];
		} else {
			return false;
		}
	}

	return cur;
}

var SaveAbleEntity = require("./saveAbleEntity");

var User = function (id) {
	var userDomain;
	var theUser = this;

	function updateSearch(view) {
		step(function () {
			this.parallel.unflatten();
			theUser.getName(view, this);
		}, h.sF(function (name) {
			search.user.index(name, id);
			//TO-DO: search.friendsSearch(view).updateOwn(friends, name);
		}), function (e) {
			console.error(e);
		});
	}

	if (id) {
		id = h.parseDecimal(id);
		userDomain = "user:" + id;
	}

	var databaseUser = new SaveAbleEntity(validKeys, this, userDomain);

	function getAttribute(view, attr, cb, fullHash) {
		databaseUser.getAttribute(view, attr, cb, fullHash);
	}

	function setAttribute(view, attr, value, cb) {
		databaseUser.setAttribute(view, attr, value, cb);
	}

	function createAccessors(attributes) {
		attributes.forEach(function (attribute) {
			var accessor = h.capitaliseFirstLetter(attribute);

			this["get" + accessor] = function getAttribute(view, cb) {
				databaseUser.getAttribute(view, attribute, cb);
			};

			this["set" + accessor] = function setAttribute(view, value, cb) {
				databaseUser.setAttribute(view, attribute, value, cb);
			};
		});
	}

	createAccessors(["password", "nickname", "migrationState", "email",
					"friendsLevel2Key", "mainKey", "cryptKey", "signKey", "friendsKey"]);

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

	this.save = function doSave(view, cb) {
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

			databaseUser.save(view, userDomain, this);
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

	this.isOwnUser = function isOwnUserF(view) {
		return parseInt(view.getUserID(), 10) === id;
	};

	this.isOnline = function isOnlineF(cb) {
		client.sismember("user:online", id, cb);
	};

	function getNameF(view, cb) {
		step(function () {
			this.parallel.unflatten();
			theUser.getNickname(view, this.parallel());
			getAttribute(view, "profile:basic", this.parallel());
		}, h.sF(function (nickname, basicProfile) {
			var res = [], name;
			if (basicProfile) {
				basicProfile = JSON.parse(basicProfile);
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

	this.getEMail = function(view, cb) {
		step(function () {
			getAttribute(view, "email", this);
		}, cb);
	};

	this.setMail = function(view, mail, cb) {
		step(function doSetMail() {
			setAttribute(view, "email", mail, this);
		}, cb);
	};

	this.setPublicProfile = function(view, profile, cb) {
		step(function doSetPublicProfile() {
			setAttribute(view, "profile", profile, this);
		}, cb);
	};

	this.createPrivateProfile = function(view, data, cb) {
		step(function doCreatePP1() {
			view.ownUserError(id, this);
		}, h.sF(function doCreatePP2() {
			var Profile = require("./profile");
			Profile.create(view, data, this);
		}), cb);
	};

	this.deletePrivateProfile = function(view, profileID, cb) {
		step(function removePP1() {
			view.ownUserError(id, this);
		}, h.sF(function removePP2() {
			require("./profile").get(view, profileID, this);
		}), h.sF(function removePP3(profile) {
			if (!profile) {
				throw new Error("profile not existing");
			}

			profile.remove(view, this);
		}), cb);
	};

	this.getPrivateProfiles = function(view, cb, json) {
		step(function getPP1() {
			var Profile = require("./profile");
			if (json) {
				Profile.getAccessed(view, id, this);
			} else {
				Profile.getAccessed(view, id, this.last);
			}
		}, h.sF(function getPP2(p) {
			var i;
			for (i = 0; i < p.length; i += 1) {
				p[i].getPData(view, this.parallel(), true);
			}

			this.parallel()();
		}), cb);
	};

	this.getPublicProfile = function(view, cb) {
		step(function doGetPublicProfile() {
			getAttribute(view, "profile", this, true);
		}, cb);
	};

	this.getFriendShipKey = function(view, cb) {
		step(function getFSKF() {
			view.logedinError(this);
		}, h.sF(function () {
			client.get("friends:key:" + id + ":" + view.getUserID(), this);
		}), cb);
	};

	this.getReverseFriendShipKey = function(view, cb) {
		step(function getFSKF() {
			view.logedinError(this);
		}, h.sF(function () {
			client.get("friends:key:" + view.getUserID() + ":" + id, this);
		}), cb);
	};

	function keyIDsToObjects(keys, cb) {
		step(function () {
			keys.forEach(function (key) {
				KeyApi.get(key, this.parallel());
			}, this);
		}, cb);
	}

	function getArrayKeys(view, arr, cb, options) {
		options = options || {};

		step(function () {
			var i;
			for (i = 0; i < arr.length; i += 1) {
				getAttribute(view, arr[i], this.parallel());
			}
		}, h.sF(function (keys) {
			if (options.keyObject) {
				keyIDsToObjects(keys, this);
			} else {
				this.ne(keys);
			}
		}), h.sF(function (keys) {
			var i, result = {};
			for (i = 0; i < keys.length; i += 1) {
				if (options.noSuffix) {
					result[arr[i].replace(/Key$/, "")] = keys[i];
				} else {
					result[arr[i]] = keys[i];
				}
			}

			this.ne(result);
		}), cb);
	}

	this.getFriendShipKeys = function (view, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getFriendShipKey(view, this.parallel());
			theUser.getReverseFriendShipKey(view, this.parallel());
		}, h.sF(function (friendShipKey, reverseFriendShipKey) {
			var result = {};

			if (friendShipKey) {
				result.friendShipKey = friendShipKey;
			}

			if (reverseFriendShipKey) {
				result.reverseFriendShipKey = reverseFriendShipKey;
			}

			this.ne(result);
		}), cb);
	};

	var ownKeys = ["mainKey"];
	this.getOwnKeys = function (view, cb, options) {
		getArrayKeys(view, ownKeys, cb, options);
	};

	var publicKeys = ["cryptKey", "signKey"];
	this.getPublicKeys = function (view, cb, options) {
		getArrayKeys(view, publicKeys, cb, options);
	};

	var friendsKeys = ["friendsKey", "friendsLevel2Key"];
	this.getFriendsKeys = function (view, cb, options) {
		getArrayKeys(view, friendsKeys, cb, options);
	};

	function loadMultipleNamedKeys(view, keys, cb) {
		var names = Object.keys(keys);

		step(function () {
			names.forEach(function (name) {
				KeyApi.get(keys[name], this.parallel());
			}, this);
		}, h.sF(function (keyObjs) {
			keyObjs.forEach(function (key, index) {
				if (!key) {
					console.log("Key not found for " + names[index] + " with id " + keys[names[index]]);
					throw new Error("key not found!");
				}

				key.getKData(view, this.parallel(), true);
			}, this);
		}), h.sF(function (keyData) {
			var result = {};

			keyData.forEach(function (data, index) {
				result[names[index]] = data;
			});

			this.ne(result);
		}), cb);
	}

	this.getKeys = function (view, cb) {
		step(function () {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(view, theUser.getID(), this);
		}, h.sF(function (hasAccess) {
			theUser.getPublicKeys(view, this.parallel());

			if (hasAccess) {
				theUser.getFriendsKeys(view, this.parallel());

				if (theUser.isOwnUser(view)) {
					theUser.getOwnKeys(view, this.parallel());
				} else {
					theUser.getFriendShipKeys(view, this.parallel());
				}
			}
		}), h.sF(function (keys) {
			keys = h.object.multipleFlatJoin(keys);
			loadMultipleNamedKeys(view, keys, this);
		}), cb);
	};

	this.searchFriends = function (view, text, cb) {
		step(function () {
			//TO-DO make other users friends also searchable. but this should be configurable by the user.
			view.ownUserError(theUser, this);
		}, h.sF(function () {
			var fSearch = new search.friendsSearch(id);
			fSearch.findFriend(text, this);
		}), h.sF(function (ids) {
			this.ne(ids);
		}), cb);
	};

	this.getMutualFriends = function (view, cb) {
		var friends = require("./friends");
		if (theUser.isOwnUser(view)) {
			cb(null, []);
		} else {
			friends.myMutual(view, id, cb);
		}
	};

	this.getUData = function (view, cb) {
		var result;
		step(function () {
			view.logedinError(this);
		}, h.sF(function () {
			this.parallel.unflatten();

			theUser.getNickname(view, this.parallel());
			theUser.getPublicProfile(view, this.parallel());
			theUser.getPrivateProfiles(view, this.parallel(), true);
			theUser.getKeys(view, this.parallel());
			theUser.getMutualFriends(view, this.parallel());

			if (theUser.isOwnUser(view)) {
				theUser.getMigrationState(view, this.parallel());
				theUser.getEMail(view, this.parallel());
			}
		}), h.sF(function (nick, pubProf, privProf, keys, mutualFriends, migrationState, mail) {
			result = {
				id: id,
				nickname: nick,
				profile: {
					pub: pubProf,
					priv: privProf
				}
			};

			if (theUser.isOwnUser(view)) {
				result.migrationState = migrationState;
				result.mail = mail;
			}

			result.keys = keys;

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

	this.listen = function listenF(view, cb) {
		view.psub(userDomain + ":*", function (channel, data) {
			cb(channel, JSON.parse(data));
		});
	};
};

User.search = function (text, cb) {
	step(function () {
		this.parallel.unflatten();
		search.user.type("and").query(text, this.parallel());
		User.getUser(text, this.parallel(), true);
	}, h.sF(function (ids, user) {
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