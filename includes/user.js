"use strict";

var step = require("step");
var client = require("./redisClient");
var h = require("./helper");
var extend = require("xtend");

function logedinF(view, cb) {
	step(function () {
		view.logedinError(this);
	}, cb);
}

var validKeys = {
	salt: {
		read: true,
		pre: function (cb, view, user, newSalt, oldSalt) {
			step(function () {
				view.logedinError(this);
			}, cb);
		}
	},
	nickname: {
		read: logedinF,
		//TODO: match:?
		match: /^[A-z][A-z0-9]*$/,
		pre: function (cb, view, user, newNick, oldNick) {
			step(function () {
				view.ownUserError(user, this);
			}, h.sF(function () {
				client.setnx("user:nickname:" + newNick, user.getID(), this);
			}), h.sF(function (set) {
				if (set) {
					this.ne();
				} else {
					throw new NicknameInUse(newNick);
				}
			}), cb);
		},
		post: function (cb, view, user, newNick, oldNick) {
			step(function () {
				client.del("user:nickname:" + oldNick, this);
			}, cb);
		}
	},
	email: {
		read: logedinF,
		match: /^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i,
		pre: function (cb, view, user, newMail, oldMail) {
			step(function () {
				view.ownUserError(user, this);
			}, h.sF(function () {
				client.setnx("user:mail:" + newMail, user.getID(), this);
			}), h.sF(function (set) {
				if (set) {
					this.ne();
				} else {
					throw new MailInUse(newMail);
				}
			}), cb);
		},
		post: function (cb, view, user, newMail, oldMail) {
			step(function () {
				client.del("user:mail:" + oldNick);
				this.ne();
			}, cb);
		}
	}
};

var User = function (id) {
	var userDomain;
	var theUser = this;

	var getAttribute;

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

	function doSetOperation(view, key, value, cb) {
		//TODO: post, match
		var oldValue, attr;
		step(function () {
			attr = h.deepGet(validKeys, key);

			if (!attr) {
				throw new AccessViolation(key.toString(":"));
			}

			theUser.getAttribute(key, this);
		}, h.sF(function (oldVal) {
			oldValue = oldVal;
			if (typeof attr.pre === "function") {
				attr.pre(view, theUser, value, oldValue, this);
			} else {
				this.ne();
			}
		}), h.sF(function () {
			client.set(userDomain + ":" + obj2key(key), value, this);
		}), h.sF(function () {
			if (typeof attr.post === "function") {
				//TODO: rollback if this fails!
				attr.post(view, theUser, value, oldValue, this);
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

	function realGetAttribute(key, cb) {
		step(function () {
			if (validKey(key)) {
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
				//check given data!
				client.incr("users", this);
			}, h.sF(function handleNewID(myid) {
				id = myid;
				userDomain = "user:" + id;

				setAttribute = setAttributeF;
				getAttribute = realGetAttribute;
				setAttribute(view, vals, this);
			}), h.sF(function saveDone() {
				saved = true;
				this.ne(true);
			}), cb);
		};
	}

	function isSavedF() {
		return saved;
	}

	this.isSaved = isSavedF;

	function getNicknameF(cb) {
		step(function doGetNickname() {
			getAttribute("nickname", this);
		}, cb);
	}
	this.getNickname = getNicknameF;

	//todo: think how we want to handle uniqueness in basic saving!
	//we need to:
	// - make sure no nick is taken two times
	// - one user only blocks one nick (del unused nicks)
	function setNicknameF(view, nickname, cb) {
		step(function () {
			setAttribute(view, {nickname: nickname}, this);
		}, cb);
	}
	this.setNickname = setNicknameF;

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
};

User.getUser = function (identifier, callback) {
	step(function () {
		if (h.isMail(identifier)) {
			client.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			client.get("user:nickname:" + identifier, this);
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