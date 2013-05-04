"use strict";

var step = require("step");
var redis = require("redis");
var h = require("./helper");
var extend = require("xtend");

var validKeys = {
	nickname: true,
	email: true
};

redis.debug_mode = true;

var User = function (id) {
	var userDomain;

	var theClient = redis.createClient();

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

	function realSetAttribute(val, key, cb) {
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
							realSetAttribute(val, key, this.parallel());
						} else {
							theClient.set(userDomain + ":" + obj2key(key), cur, this.parallel());
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

	function setAttributeF(val, cb) {
		realSetAttribute(val, [], cb);
	}

	var setAttribute, saved;

	function realGetAttribute(key, cb) {
		step(function () {
			if (validKey(key)) {
				theClient.get(userDomain + ":" + obj2key(key), this);
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

		setAttribute = function (val, cb) {
			step(function fakeSetAttribute() {
				vals = extend(vals, val);
				this.ne(true);
			}, cb);
		};

		saved = false;
		this.save = function doSave(cb) {
			step(function doSave() {
				//check given data!
				theClient.incr("users", this);
			}, h.sF(function handleNewID(myid) {
				id = myid;
				userDomain = "user:" + id;

				setAttribute = setAttributeF;
				getAttribute = realGetAttribute;
				setAttribute(vals, this);
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
	function setNicknameF(nickname, cb) {
		step(function () {
			client.setnx("user:nickname:" + nickname, id, this);
		}, h.sF(function () {
			client.get("user:nickname:" + nickname, this);
		}), h.sF(function (setID) {
			if (setID === id) {
				getAttribute("nickname", this);
			} else {
				throw new NicknameInUse(nickname);
			}
		}), h.sF(function (nickname) {
			client.del("user:nickname:" + nickname);
			setAttribute({nickname: nickname}, this);
		}), cb);
	}
	this.setNickname = setNicknameF;

	function getEMailF(cb) {
		step(function () {
			getAttribute("email", this);
		}, cb);
	}
	this.getEMail = getEMailF;

	function setMailF(mail, cb) {
		step(function doSetMail() {
			setAttribute({email: mail}, this);
		}, cb);
	}
	this.setMail = setMailF;
};

User.getUser = function (identifier, callback) {
	var theClient;
	step(function () {
		theClient = redis.createClient();

		if (h.isMail(identifier)) {
			theClient.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			theClient.get("user:nickname:" + identifier, this);
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