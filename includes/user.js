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
		if (data.user.isSaved()) {
			data.request.session.logedinError(this);
		} else {
			this.ne();
		}
	}, cb);
}

function ownUserF(data, cb) {
	step(function () {
		if (data.user.isSaved()) {
			data.request.session.ownUserError(data.user, this);
		} else {
			this.ne();
		}
	}, cb);
}

function hasFriendKeyAccess(data, cb) {
	step(function () {
		if (data.user.isSaved()) {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(data.request, data.user.getID(), this);
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

function falseF(data, cb) {
	cb(new AccessViolation());
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
		transform: keyToRealID,
		unset: falseF
	},
	friendsKey: {
		read: hasFriendKeyAccess,
		pre: checkKeyExists(SymKey),
		transform: keyToRealID,
		unset: falseF
	},
	friendsLevel2Key: {
		read: hasFriendKeyAccess,
		pre: checkKeyExists(SymKey),
		transform: keyToRealID,
		unset: falseF
	},
	cryptKey: {
		read: logedinF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID,
		unset: falseF
	},
	signKey: {
		read: logedinF,
		pre: checkKeyExists(EccKey),
		transform: keyToRealID,
		unset: falseF
	},
	nickname: {
		read: logedinF,
		match: /^[A-z][A-z0-9]*$/,
		pre: function (data, cb) {
			step(function nPre1() {
				ownUserF(data, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + data.value, data.user.getID(), this);
			}), h.sF(function nPre2(set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:nickname:" + data.value, this);
				}
			}), h.sF(function nPre3(id) {
				if (id === data.user.getID()) {
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
		},
		unset: function (data, cb) {
			step(function () {
				ownUserF(data, this);
			}, h.sF(function () {
				client.get("user:nickname:" + data.value, this);
			}), h.sF(function (id) {
				if (id === data.user.getID()) {
					client.del("user:nickname:" + data.value, this);
				} else {
					this.last.ne();
				}
			}), cb);
		}
	},
	email: {
		read: logedinF,
		match: /^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i,
		pre: function (data, cb) {
			step(function mailPre1() {
				ownUserF(data, this);
			}, h.sF(function mailPre2() {
				client.setnx("user:mail:" + data.value.toLowerCase(), data.user.getID(), this);
			}), h.sF(function mailPre3(set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:mail:" + data.value.toLowerCase(), this);
				}
			}), h.sF(function mailPre4(id) {
				if (id === data.user.getID()) {
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
		},
		unset: function (data, cb) {
			step(function () {
				ownUserF(data, this);
			}, h.sF(function () {
				client.get("user:mail:" + data.value.toLowerCase(), this);
			}), h.sF(function (id) {
				if (id === data.user.getID()) {
					client.del("user:mail:" + data.value.toLowerCase(), this);
				} else {
					this.last.ne();
				}
			}), cb);
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

var User = function (id) {
	var userDomain;
	var theUser = this;

	var getAttribute, unsetAttribute;

	var setAttribute, saved;

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

	/** set an attribute of this user.
	* @param request current request (for session etc.)
	* @param key key to set
	* @param value value to set to
	* @param cb callback
	* checks if we are allowed to do this set operation and uses validKeys for this.
	*/
	function doSetOperation(request, key, value, cb) {
		var attr, data = {};
		//request, user, key, value, oldValue

		var newKey = [];

		var i;
		for (i = 0; i < key.length; i += 1) {
			newKey.push(key[i]);
		}

		key = newKey;

		step(function () {
			attr = h.deepGet(validKeys, key);

			if (!attr) {
				throw new AccessViolation(obj2key(key));
			}

			data.request = request;
			data.user = theUser;
			data.key = key;
			data.value = value;

			if (typeof attr.match === "object" && attr.match instanceof RegExp) {
				if (!attr.match.test(data.value)) {
					throw new InvalidAttribute(obj2key(key));
				}
			}

			getAttribute(request, key, this);
		}, h.sF(function (oldVal) {
			data.oldValue = oldVal;

			if (typeof attr.pre === "function") {
				attr.pre(data, this);
			} else {
				this.ne();
			}
		}), h.sF(function () {
			if (typeof attr.transform === "function") {
				attr.transform(data, this);
			} else {
				this.ne(value);
			}
		}), h.sF(function (realValue) {
			data.value = realValue;

			if (attr.hash) {
				client.multi().del(userDomain + ":" + obj2key(key)).hmset(userDomain + ":" + obj2key(key), data.value).exec(this);
			} else {
				console.log("SET " + userDomain + ":" + obj2key(key) + "-" + data.value);
				client.set(userDomain + ":" + obj2key(key), data.value, this);
			}
		}), h.sF(function () {
			if (typeof attr.post === "function") {
				attr.post(data, this);
			} else {
				this.ne();
			}
		}), cb);
	}

	function realGetAttribute(request, key, cb) {
		var attr;
		step(function () {
			if (validKey(key)) {
				attr = h.deepGet(validKeys, key);

				var data = {
					request: request,
					user: theUser
				};

				if (typeof attr.read === "function") {
					attr.read(data, this);
				} else {
					this.ne();
				}
			} else {
				throw new AccessViolation(obj2key(key));
			}
		}, h.sF(function () {
			if (attr.hash) {
				client.hgetall(userDomain + ":" + obj2key(key), this);
			} else {
				client.get(userDomain + ":" + obj2key(key), this);
			}
		}), h.sF(function (res) {
			if (typeof attr.readTransform === "function") {
				attr.readTransform(res, this);
			} else {
				this.ne(res);
			}
		}), cb);
	}

	/** set an attribute of this user.
	* @param request current request (for session etc.)
	* @param key key to set
	* @param value value to set to
	* @param cb callback
	* checks if we are allowed to do this set operation and uses validKeys for this.
	*/
	function realUnsetAttribute(request, key, cb) {
		var attr, data = {};
		//request, user, key, value

		step(function () {
			attr = h.deepGet(validKeys, key);

			if (!attr) {
				throw new AccessViolation(obj2key(key));
			}

			data.request = request;
			data.user = theUser;
			data.key = key;

			getAttribute(request, key, this);
		}, h.sF(function (value) {
			data.value = value;

			if (typeof attr.unset === "function") {
				attr.unset(data, this);
			} else {
				this.ne();
			}
		}), h.sF(function () {
			client.del(userDomain + ":" + obj2key(key), this);
		}), cb);
	}

	function realSetAttribute(request, val, key, cb) {
		var doUpdateSearch = false;
		step(function doRealSetAttribute() {
			if (typeof val === "undefined") {
				this.last.ne();
			}

			if (typeof key !== "object") {
				key = [];
			} else {
				var newKey = [];

				var i;
				for (i = 0; i < key.length; i += 1) {
					newKey.push(key[i]);
				}

				key = newKey;
			}

			//console.log("Current Key:" + JSON.stringify(key));
			//console.log("Current Val:" + JSON.stringify(val));

			var valKey, cur, valid;
			for (valKey in val) {
				if (val.hasOwnProperty(valKey)) {
					key.push(valKey);

					cur = val[valKey];
					valid = validKey(key);
					if (valid !== false) {
						if (typeof valid.read === "undefined") {
							realSetAttribute(request, cur, key, this.parallel());
						} else {
							doSetOperation(request, key, cur, this.parallel());
							if (UPDATESEARCHON.indexOf(obj2key(key)) > -1) {
								doUpdateSearch = true;
							}
						}
					} else {
						console.log("rejected: " + obj2key(key));
					}

					key.pop();
				}
			}

			this.parallel()();
		}, h.sF(function finishUp() {
			if (doUpdateSearch && saved === true) {
				updateSearch(request);
			}
			this.ne();
		}), cb);
	}

	function setAttributeF(request, val, cb) {
		realSetAttribute(request, val, [], cb);
	}

	function deleteF(cb) {
		//TODO: think about nickname, mail (unique values)
		step(function () {
			client.keys(userDomain + ":*", this);
		}, h.sF(function (keys) {
			var i;
			for (i = 0; i < keys.length; i += 1) {
				client.del(keys[i], this.parallel());
			}
		}), cb);
	}

	if (id) {
		userDomain = "user:" + id;
		saved = true;
		setAttribute = setAttributeF;
		getAttribute = realGetAttribute;
		unsetAttribute = realUnsetAttribute;
	} else {
		var vals = {};

		getAttribute = function (request, key, cb) {
			step(function fakeGetAttribute() {
				key = key2obj(key);
				var i, cur = vals;
				for (i = 0; i < key.length; i += 1) {
					if (!cur) {
						this.ne(null);
						return;
					}

					cur = cur[key[i]];
				}

				if (cur) {
					this.ne(cur);
				} else {
					this.ne(null);
				}
			}, cb);
		};

		unsetAttribute = function (request, key, cb) {
			step(function fakeUnsetAttribute() {
				key = key2obj(key);
				var i, cur = vals;
				for (i = 0; i < key.length - 1; i += 1) {
					if (!cur) {
						this.ne();
						return;
					}

					cur = cur[key[i]];
				}

				delete cur[key[key.length - 1]];
				this.ne(true);
			}, cb);
		};

		setAttribute = function (request, val, cb) {
			step(function fakeSetAttribute() {
				vals = extend(vals, val);
				this.ne(true);
			}, cb);
		};

		saved = false;
		this.save = function doSave(request, cb) {
			step(function doSave() {
				client.incr("user:count", this);
			}, h.sF(function handleNewID(myid) {
				id = myid;
				userDomain = "user:" + id;

				client.setnx("user:id:" + id, id, this);
			}), h.sF(function (set) {
				if (!set) {
					console.error("id for user already in use (dafuq!): " + id);
					throw "id for user already in use!";
				}
				setAttribute = setAttributeF;
				getAttribute = realGetAttribute;
				unsetAttribute = realUnsetAttribute;
				client.sadd("user:list", id, this);
			}), h.sF(function () {
				setAttribute(request, vals, this);
			}), function saveDone(e) {
				if (e) {
					deleteF(function (e) {
						if (e) {
							console.error(e);
						}
					});

					throw e;
				}
				saved = true;
				this.ne(true);
			}, cb);
		};
	}

	function isSavedF() {
		return saved;
	}
	this.isSaved = isSavedF;

	function getIDF() {
		return h.parseDecimal(id);
	}
	this.getID = getIDF;

	this.isOwnUser = function isOwnUserF(request) {
		return parseInt(request.session.getUserID(), 10) === parseInt(id, 10);
	};

	this.isOnline = function isOnlineF(cb) {
		step(function () {
			client.sismember("user:online", id, this);
		}, cb);
	};

	function getNameF(request, cb) {
		step(function () {
			this.parallel.unflatten();
			theUser.getNickname(request, this.parallel());
			client.hget(userDomain + ":profile", "basic", this.parallel());
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

	function getNicknameF(request, cb) {
		step(function doGetNickname() {
			getAttribute(request, "nickname", this);
		}, cb);
	}
	this.getNickname = getNicknameF;

	function setNicknameF(request, nickname, cb) {
		step(function () {
			setAttribute(request, {nickname: nickname}, this);
		}, cb);
	}
	this.setNickname = setNicknameF;

	function setPasswordF(request, password, cb) {
		step(function doSetPassword() {
			setAttribute(request, {password: password}, this);
		}, cb);
	}
	this.setPassword = setPasswordF;

	function getPasswordF(request, cb) {
		step(function doGetPassword() {
			getAttribute(request, "password", this);
		}, cb);
	}
	this.getPassword = getPasswordF;

	function getEMailF(request, cb) {
		step(function () {
			getAttribute(request, "email", this);
		}, cb);
	}
	this.getEMail = getEMailF;

	function setMailF(request, mail, cb) {
		step(function doSetMail() {
			setAttribute(request, {email: mail}, this);
		}, cb);
	}
	this.setMail = setMailF;

	function setPublicProfileF(request, profile, cb) {
		step(function doSetPublicProfile() {
			setAttribute(request, {profile: profile}, this);
		}, cb);
	}
	this.setPublicProfile = setPublicProfileF;

	function createPrivateProfileF(request, data, cb) {
		step(function doCreatePP1() {
			request.session.ownUserError(id, this);
		}, h.sF(function doCreatePP2() {
			var Profile = require("./profile");
			Profile.create(request, data, this);
		}), cb);
	}
	this.createPrivateProfile = createPrivateProfileF;

	function deletePrivateProfileF(request, profileID, cb) {
		step(function removePP1() {
			request.session.ownUserError(id, this);
		}, h.sF(function removePP2() {
			require("./profile").get(request, profileID, this);
		}), h.sF(function removePP3(profile) {
			if (!profile) {
				throw new Error("profile not existing");
			}

			profile.remove(request, this);
		}), cb);
	}
	this.deletePrivateProfile = deletePrivateProfileF;

	function getPrivateProfilesF(request, cb, json) {
		step(function getPP1() {
			var Profile = require("./profile");
			if (json) {
				Profile.getAccessed(request, id, this);
			} else {
				Profile.getAccessed(request, id, this.last);
			}
		}, h.sF(function getPP2(p) {
			var i;
			for (i = 0; i < p.length; i += 1) {
				p[i].getPData(request, this.parallel(), true);
			}

			this.parallel()();
		}), cb);
	}
	this.getPrivateProfiles = getPrivateProfilesF;

	function getPublicProfileF(request, cb) {
		step(function doGetPublicProfile() {
			getAttribute(request, "profile", this);
		}, h.sF(function (res) {
			this.ne(res);
		}), cb);
	}

	this.getPublicProfile = getPublicProfileF;

	this.setMigrationState = function (request, state, cb) {
		setAttribute(request, {migrationState: state}, cb);
	};

	this.getMigrationState = function (request, cb) {
		getAttribute(request, "migrationState", cb);
	};

	function setFriendsKeyF(request, key, cb) {
		setAttribute(request, {friendsKey: key}, cb);
	}

	function setFriendsLevel2KeyF(request, key, cb) {
		setAttribute(request, {friendsLevel2Key: key}, cb);
	}

	function setMainKeyF(request, key, cb) {
		setAttribute(request, {mainKey: key}, cb);
	}

	function setCryptKeyF(request, key, cb) {
		setAttribute(request, {cryptKey: key}, cb);
	}

	function setSignKeyF(request, key, cb) {
		setAttribute(request, {signKey: key}, cb);
	}

	this.setMainKey = setMainKeyF;
	this.setCryptKey = setCryptKeyF;
	this.setSignKey = setSignKeyF;
	this.setFriendsKey = setFriendsKeyF;
	this.setFriendsLevel2Key = setFriendsLevel2KeyF;

	function getFriendsKeyF(request, cb) {
		getAttribute(request, "friendsKey", cb);
	}

	function getFriendsLevel2KeyF(request, cb) {
		getAttribute(request, "friendsLevel2Key", cb);
	}

	function getFriendShipKeyF(request, cb) {
		step(function getFSKF() {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.get("friends:key:" + id + ":" + request.session.getUserID(), this);
		}), cb);
	}

	function getReverseFriendShipKeyF(request, cb) {
		step(function getFSKF() {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.get("friends:key:" + request.session.getUserID() + ":" + id, this);
		}), cb);
	}

	function getMainKeyF(request, cb) {
		getAttribute(request, "mainKey", cb);
	}

	function getCryptKeyF(request, cb) {
		getAttribute(request, "cryptKey", cb);
	}

	function getSignKeyF(request, cb) {
		getAttribute(request, "signKey", cb);
	}

	this.getMainKey = getMainKeyF;
	this.getCryptKey = getCryptKeyF;
	this.getSignKey = getSignKeyF;
	this.getFriendsKey = getFriendsKeyF;
	this.getFriendsLevel2Key = getFriendsLevel2KeyF;
	this.getFriendShipKey = getFriendShipKeyF;
	this.getReverseFriendShipKey = getReverseFriendShipKeyF;

	function keyIDsToObjects(keys, cb) {
		step(function () {
			keys.forEach(function (key) {
				KeyApi.get(key, this.parallel());
			}, this);
		}, cb);
	}

	function getArrayKeys(request, arr, cb, options) {
		options = options || {};

		step(function () {
			var i;
			for (i = 0; i < arr.length; i += 1) {
				getAttribute(request, arr[i], this.parallel());
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

	this.getFriendShipKeys = function (request, cb) {
		step(function () {
			this.parallel.unflatten();

			theUser.getFriendShipKey(request, this.parallel());
			theUser.getReverseFriendShipKey(request, this.parallel());
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
	this.getOwnKeys = function (request, cb, options) {
		getArrayKeys(request, ownKeys, cb, options);
	};

	var publicKeys = ["cryptKey", "signKey"];
	this.getPublicKeys = function (request, cb, options) {
		getArrayKeys(request, publicKeys, cb, options);
	};

	var friendsKeys = ["friendsKey", "friendsLevel2Key"];
	this.getFriendsKeys = function (request, cb, options) {
		getArrayKeys(request, friendsKeys, cb, options);
	};

	function loadMultipleNamedKeys(request, keys, cb) {
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

				key.getKData(request, this.parallel(), true);
			}, this);
		}), h.sF(function (keyData) {
			var result = {};

			keyData.forEach(function (data, index) {
				result[names[index]] = data;
			});

			this.ne(result);
		}), cb);
	}

	this.getKeys = function (request, cb) {
		step(function () {
			var friends = require("./friends");
			friends.hasFriendsKeyAccess(request, theUser.getID(), this);
		}, h.sF(function (hasAccess) {
			theUser.getPublicKeys(request, this.parallel());

			if (hasAccess) {
				theUser.getFriendsKeys(request, this.parallel());

				if (theUser.isOwnUser(request)) {
					theUser.getOwnKeys(request, this.parallel());
				} else {
					theUser.getFriendShipKeys(request, this.parallel());
				}
			}
		}), h.sF(function (keys) {
			keys = h.object.multipleFlatJoin(keys);
			loadMultipleNamedKeys(request, keys, this);
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

	this.getUData = function (request, cb) {
		var result;
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			this.parallel.unflatten();

			theUser.getNickname(request, this.parallel());
			theUser.getPublicProfile(request, this.parallel());
			theUser.getPrivateProfiles(request, this.parallel(), true);
			theUser.getKeys(request, this.parallel());
			theUser.getMutualFriends(request, this.parallel());

			if (theUser.isOwnUser(request)) {
				theUser.getMigrationState(request, this.parallel());
				theUser.getEMail(request, this.parallel());
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

			if (theUser.isOwnUser(request)) {
				result.migrationState = migrationState;
				result.mail = mail;
			}

			result.keys = keys;

			result.mutualFriends = mutualFriends;

			this.last.ne(result);
		}), cb);
	};

	function generateTokenF(cb) {
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
	}
	this.generateToken = generateTokenF;

	function getOnlineStatusF(cb) {
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
	}
	this.getOnlineStatus = getOnlineStatusF;

	function useTokenF(token, cb) {
		step(function () {
			client.del(userDomain + ":token:" + token, this);
		}, h.sF(function (deleted) {
			if (deleted === 1) {
				this.ne(true);
			} else {
				this.ne(false);
			}
		}), cb);
	}
	this.useToken = useTokenF;

	this.listen = function listenF(request, cb) {
		request.socketData.psub(userDomain + ":*", function (channel, data) {
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