"use strict";

var step = require("step");
var client = require("./redisClient");
var h = require("./helper");
var extend = require("xtend");

function logedinF(data, cb) {
	step(function () {
		data.view.logedinError(this);
	}, cb);
}

function ownUserF(data, cb) {
	step(function () {
		data.view.ownUserError(this);
	}, cb);
}

var validKeys = {
	password: {
		read: true,
		pre: ownUserF
	},
	//TODO
	mainKey: {
		read: ownUserF
	},
	cryptKey: {
		read: ownUserF
	},
	signKey: {
		read: ownUserF
	},
	nickname: {
		read: logedinF,
		match: /^[A-z][A-z0-9]*$/,
		pre: function (data, cb) {
			step(function () {
				data.view.ownUserError(data.user, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + data.value, data.user.getID(), this);
			}), h.sF(function (set) {
				if (set) {
					this.last.ne();
				} else {
					client.get("user:nickname:" + data.value, this);
				}
			}), h.sF(function (id) {
				if (id === data.user.getID()) {
					this.last.ne();
				} else {
					throw new NicknameInUse(data.value);
				}
			}), cb);
		},
		post: function (data, cb) {
			step(function () {
				client.del("user:nickname:" + data.oldValue, this);
			}, cb);
		}
	},
	email: {
		read: logedinF,
		match: /^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i,
		pre: function (data, cb) {
			step(function () {
				data.view.ownUserError(data.user, this);
			}, h.sF(function () {
				client.setnx("user:mail:" + data.value, data.user.getID(), this);
			}), h.sF(function (set) {
				if (set) {
					this.ne();
				} else {
					client.get("user:mail:" + data.value, this);
				}
			}), h.sF(function (id) {
				if (id === data.user.getID()) {
					this.last.ne();
				} else {
					throw new MailInUse(data.value);
				}
			}), cb);
		},
		post: function (data, cb) {
			step(function () {
				client.del("user:mail:" + data.oldValue);
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

	return true;
}

var User = function (id) {
	var userDomain;
	var theUser = this;

	var getAttribute;

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

		step(function () {
			attr = h.deepGet(validKeys, key);

			if (!attr) {
				throw new AccessViolation(key.toString(":"));
			}

			data.view = view;
			data.user = theUser;
			data.key = key;
			data.value = value;

			theUser.getAttribute(key, this);
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

			client.set(userDomain + ":" + obj2key(key), data.value, this);
		}), h.sF(function () {
			if (typeof attr.post === "function") {
				//TODO: rollback if this fails!
				attr.post(data, this);
			} else {
				this.ne();
			}
		}), cb);
	}

	function realSetAttribute(view, val, key, cb) {
		console.log(arguments);
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

	var setAttribute, saved;

	function deleteF(cb) {
		step(function () {
			client.keys(userDomain + ":*", this);
		}, h.sF(function (keys) {
			var i;
			for (i = 0; i < keys.length; i += 1) {
				client.del(keys[i], this.parallel());
			}
		}), cb);
	}

	function realGetAttribute(key, cb) {
		step(function () {
			if (validKey(key)) {
				var attr = h.deepGet(validKeys, key);

				var data = {
					view: view,
					user: theUser
				};

				if (typeof attr.read === "function") {
					attr.read(data, this);
				}

				client.get(userDomain + ":" + obj2key(key), this);
			}
		}, cb);
	}

	if (id) {
		userDomain = "user:" + id;
		saved = true;
		setAttribute = setAttributeF;
		getAttribute = realGetAttribute;
	} else {
		var vals = {};

		getAttribute = function (key, cb) {
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

		setAttribute = function (view, val, cb) {
			step(function fakeSetAttribute() {
				vals = extend(vals, val);
				this.ne(true);
			}, cb);
		};

		saved = false;
		this.save = function doSave(view, cb) {
			step(function doSave() {
				client.incr("users", this);
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
				setAttribute(view, vals, this);
			}), function saveDone(e) {
				if (e) {
					deleteF(function () {});
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

	function getNicknameF(cb) {
		step(function doGetNickname() {
			getAttribute("nickname", this);
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

	function getPasswordF(cb) {
		step(function doGetPassword() {
			getAttribute("password", this);
		}, cb);
	}
	this.getPassword = getPasswordF;

	function getEMailF(cb) {
		step(function () {
			getAttribute("email", this);
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
			var random = require("random");
			random.getRandomInt(0, 999999999999999, this);
		}, h.sF(function (random) {
			token = random;
			client.set(userDomain + ":token:" + random, 'true', 'NX', 'EX', 60 * 5, this);
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
			return new User(id);
		}

		throw new UserNotExisting(identifier);
	}), callback);
};

module.exports = User;