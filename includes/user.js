/* global require, module, console, StepError, NotLogedin, InvalidLogin, AccessViolation, InvalidToken, UserNotExisting, MailInUse, NicknameInUse, InvalidPassword, InvalidAttribute, LostDecryptor, InvalidDecryptor, RealIDInUse, InvalidRealID, NotASymKey, InvalidSymKey, NotAEccKey, InvalidEccKey,  */

"use strict";

var step = require("step");
var client = require("./redisClient");
var h = require("./helper");
var extend = require("xtend");

function logedinF(data, cb) {
	step(function () {
		if (data.user.isSaved()) {
			data.view.logedinError(this);
		} else {
			this.ne();
		}
	}, cb);
}

function ownUserF(data, cb) {
	step(function () {
		if (data.user.isSaved()) {
			data.view.ownUserError(data.user, this);
		} else {
			this.ne();
		}
	}, cb);
}

function trueF(data, cb) {
	cb();
}

function falseF(data, cb) {
	cb(new AccessViolation());
}

var EccKey = require("./crypto/eccKey");
var SymKey = require("./crypto/symKey");

var validKeys = {
	password: {
		read: trueF,
		match: /^[A-Fa-f0-9]{10}$/,
		pre: ownUserF
	},
	mainKey: {
		read: ownUserF,
		pre: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof SymKey) {
					this.last.ne();
				} else {
					SymKey.get(data.value, this);
				}
			}, h.sF(function () {
				this.ne();
			}), cb);
		},
		transform: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof SymKey) {
					this.ne(data.value.getRealID());
				} else {
					this.ne(data.value);
				}
			}, cb);
		},
		unset: falseF
	},
	cryptKey: {
		read: ownUserF,
		pre: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof EccKey) {
					this.last.ne();
				} else {
					EccKey.get(data.value, this);
				}
			}, h.sF(function () {
				this.ne();
			}), cb);
		},
		transform: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof EccKey) {
					this.ne(data.value.getRealID());
				} else {
					this.ne(data.value);
				}
			}, cb);
		},
		unset: falseF
	},
	signKey: {
		read: ownUserF,
		pre: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof EccKey) {
					this.last.ne();
				} else {
					EccKey.get(data.value, this);
				}
			}, h.sF(function () {
				this.ne();
			}), cb);
		},
		transform: function (data, cb) {
			step(function () {
				if (typeof data.value === "object" && data.value instanceof EccKey) {
					this.ne(data.value.getRealID());
				} else {
					this.ne(data.value);
				}
			}, cb);
		},
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

	return true;
}

var User = function (id) {
	var userDomain;
	var theUser = this;

	var getAttribute, unsetAttribute;

	var setAttribute, saved;

	//TODO: match
	/** set an attribute of this user.
	* @param view current view (for sessione etc.)
	* @param key key to set
	* @param value value to set to
	* @param cb callback
	* checks if we are allowed to do this set operation and uses validKeys for this.
	*/
	function doSetOperation(view, key, value, cb) {
		var attr, data = {};
		//view, user, key, value, oldValue

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

			data.view = view;
			data.user = theUser;
			data.key = key;
			data.value = value;

			if (typeof attr.match === "object" && attr.match instanceof RegExp) {
				if (!attr.match.test(data.value)) {
					throw new InvalidAttribute(obj2key(key));
				}
			}

			getAttribute(view, key, this);
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
			console.log("SET " + userDomain + ":" + obj2key(key) + "-" + data.value);
			client.set(userDomain + ":" + obj2key(key), data.value, this);
		}), h.sF(function () {
			if (typeof attr.post === "function") {
				attr.post(data, this);
			} else {
				this.ne();
			}
		}), cb);
	}

	function realGetAttribute(view, key, cb) {
		step(function () {
			if (validKey(key)) {
				var attr = h.deepGet(validKeys, key);

				var data = {
					view: view,
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
			client.get(userDomain + ":" + obj2key(key), this);
		}), cb);
	}

	/** set an attribute of this user.
	* @param view current view (for sessione etc.)
	* @param key key to set
	* @param value value to set to
	* @param cb callback
	* checks if we are allowed to do this set operation and uses validKeys for this.
	*/
	function realUnsetAttribute(view, key, cb) {
		var attr, data = {};
		//view, user, key, value

		step(function () {
			attr = h.deepGet(validKeys, key);

			if (!attr) {
				throw new AccessViolation(obj2key(key));
			}

			data.view = view;
			data.user = theUser;
			data.key = key;

			getAttribute(view, key, this);
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

	function realSetAttribute(view, val, key, cb) {
		step(function doRealSetAttribute() {
			if (typeof key !== "object") {
				key = [];
			}

			var valKey, cur;
			for (valKey in val) {
				if (val.hasOwnProperty(valKey)) {
					key.push(valKey);

					cur = val[valKey];
					if (validKey(key)) {
						if (typeof cur === "object" && !(cur instanceof Array)) {
							realSetAttribute(view, val, key, this.parallel());
						} else {
							doSetOperation(view, key, cur, this.parallel());
						}
					} else {
						console.log("rejected: " + obj2key(key));
					}

					key.pop();
				}
			}

			this.parallel()();
		}, h.sF(function finishUp() {
			this.ne();
		}), cb);
	}

	function setAttributeF(view, val, cb) {
		realSetAttribute(view, val, [], cb);
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

		getAttribute = function (view, key, cb) {
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

		unsetAttribute = function (view, key, cb) {
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

		setAttribute = function (view, val, cb) {
			step(function fakeSetAttribute() {
				vals = extend(vals, val);
				this.ne(true);
			}, cb);
		};

		saved = false;
		this.save = function doSave(view, cb) {
			step(function doSave() {
				client.incr("user:count", this);
			}, h.sF(function handleNewID(myid) {
				id = myid;
				userDomain = "user:" + id;

				client.setnx("user:id:" + id, id, this);
			}), h.sF(function (set) {
				if (!set) {
					console.error("id for user already in use: " + id);
				}
				setAttribute = setAttributeF;
				getAttribute = realGetAttribute;
				unsetAttribute = realUnsetAttribute;
				setAttribute(view, vals, this);
			}), function saveDone(e) {
				if (e) {
					deleteF(function (e) {
						console.error(e);
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
		return id;
	}
	this.getID = getIDF;

	function getNicknameF(view, cb) {
		step(function doGetNickname() {
			getAttribute(view, "nickname", this);
		}, cb);
	}
	this.getNickname = getNicknameF;

	function setNicknameF(view, nickname, cb) {
		step(function () {
			setAttribute(view, {nickname: nickname}, this);
		}, cb);
	}
	this.setNickname = setNicknameF;

	function setPasswordF(view, password, cb) {
		step(function doSetPassword() {
			setAttribute(view, {password: password}, this);
		}, cb);
	}
	this.setPassword = setPasswordF;

	function getPasswordF(view, cb) {
		step(function doGetPassword() {
			getAttribute(view, "password", this);
		}, cb);
	}
	this.getPassword = getPasswordF;

	function getEMailF(view, cb) {
		step(function () {
			getAttribute(view, "email", this);
		}, cb);
	}
	this.getEMail = getEMailF;

	function setMailF(view, mail, cb) {
		step(function doSetMail() {
			setAttribute(view, {email: mail}, this);
		}, cb);
	}
	this.setMail = setMailF;

	function setMainKeyF(view, key, cb) {
		step(function doSetCryptKey() {
			setAttribute(view, {mainKey: key}, this);
		}, cb);
	}

	function setCryptKeyF(view, key, cb) {
		step(function doSetCryptKey() {
			setAttribute(view, {cryptKey: key}, this);
		}, cb);
	}

	function setSignKeyF(view, key, cb) {
		step(function doSetSignKey() {
			setAttribute(view, {signKey: key}, this);
		}, cb);
	}

	this.setMainKey = setMainKeyF;
	this.setCryptKey = setCryptKeyF;
	this.setSignKey = setSignKeyF;

	function generateTokenF(cb) {
		var token;
		step(function () {
			var random = require("secure_random");
			random.getRandomInt(0, 999999999999999, this);
		}, h.sF(function (random) {
			token = random;
			//client.set(userDomain + ":token:" + random, 'true', 'NX', 'EX', 60 * 5, this);
			client.setnx(userDomain + ":token:" + random, 'true', this);
		}), h.sF(function (set) {
			if (set) {
				this.ne(token);
			} else {
				this.ne(false);
			}
		}), cb);
	}
	this.generateToken = generateTokenF;

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
};

User.getUser = function (identifier, callback) {
	step(function () {
		if (h.isMail(identifier)) {
			client.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			client.get("user:nickname:" + identifier, this);
		} else if (h.isID(identifier)) {
			client.get("user:id:" + identifier, this);
		} else {
			throw new UserNotExisting(identifier);
		}
	}, h.sF(function (id) {
		if (id) {
			this.ne(new User(id));
		} else {
			throw new UserNotExisting(identifier);
		}
	}), callback);
};

module.exports = User;