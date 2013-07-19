/* global require, module, console, StepError, NotLogedin, InvalidLogin, AccessViolation, InvalidToken, UserNotExisting, MailInUse, NicknameInUse, InvalidPassword, InvalidAttribute, LostDecryptor, InvalidDecryptor, RealIDInUse, InvalidRealID, NotASymKey, InvalidSymKey, NotAEccKey, InvalidEccKey, InvalidKey  */

"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

var SymKey = require("./symKey"),
	EccKey = require("./eccKey");

var Key = function (keyRealID) {
	var theKey = this;
	var domain = "key:" + keyRealID;

	if (!h.isRealID(keyRealID)) {
		throw new InvalidRealID();
	}

	function getAttribute(attr, cb) {
		step(function () {
			client.get(domain + attr, this);
		}, cb);
	}

	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	this.getOwner = function getOwnerF(cb) {
		getAttribute(":owner", cb);
	};

	this.getDecryptors = function getDecryptorsF(cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			Decryptor.getAll(keyRealID, this);
		}, cb);
	};

	this.addDecryptor = function addDecryptorF(view, data, cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			Decryptor.create(view, theKey, data, this);
		}, cb);
	};

	this.addDecryptors = function addDecryptorF(view, data, cb) {
		step(function () {
			var Decryptor = require("./decryptor"), i;
			for (i = 0; i < data.length; i += 1) {
				Decryptor.create(view, theKey, data[i], this.parallel());
			}
		}, cb);
	};

	this.addEncryptor = function addEncryptorF(realid, cb) {
		step(function () {
			client.sadd(domain + ":encryptors", realid, this);
		}, cb);
	};

	this.getEncryptors = function getEncryptorsF(cb) {
		step(function () {
			client.smembers(domain + ":encryptors", this);
		}, h.sF(function (encrs) {
			this.ne(encrs);
		}), cb);
	};

	/** add access for users to this key
	* @param decryptorid decryptor who gives access
	* @param userids users to give access
	* @param cb callback
	* @param added helper for keys already added. prevents loops
	*/
	this.addAccess = function addAccessF(decryptorid, userids, cb, added) {
		step(function () {
			var i, internal = [];
			if (!added) {
				added = [];
			} else {
				for (i = 0; i < added.length; i += 1) {
					internal.push(added[i]);
				}

				added = internal;
			}

			if (userids.length === 0) {
				this.last.ne();
				return;
			}

			if (added.indexOf(keyRealID) > -1) {
				console.log("loop!");
				this.last.ne();
			} else {
				for (i = 0; i < userids.length; i += 1) {
					client.sadd(domain + ":access", userids, this.parallel());
					client.sadd(domain + ":accessVia:" + userids, decryptorid, this.parallel());
				}

				added.push(keyRealID);
			}
		}, h.sF(function () {
			theKey.getEncryptors(this);
		}), h.sF(function (encryptors) {
			var i;
			if (encryptors.length > 0) {
				for (i = 0; i < encryptors.length; i += 1) {
					encryptors[i].addAccess(keyRealID, userids, this.parallel(), added);
				}
			} else {
				this.last.ne();
			}
		}), cb);
	};

	/** checks if the current user has access to this key
	* @param view users view
	* @param cb callback
	*/
	this.hasAccess = function hasAccessF(view, cb) {
		step(function hasAccess1() {
			client.sismember(domain + ":access", view.getUserID(), this);
		}, h.sF(function hasAccess2(access) {
			if (access === 1) {
				this.last.ne(true);
			} else {
				theKey.getOwner(this);
			}
		}), h.sF(function hasAccess3(owner) {
			if (parseInt(owner, 10) === view.getUserID()) {
				this.last.ne(true);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	this.getAccess = function getAccessF(cb) {
		step(function hasAccess1() {
			client.smembers(domain + ":access", this);
		}, h.sF(function hasAccess2(members) {
			this.last.ne(members);
		}), cb);
	};

	this.acessCount = function accessCountF(cb) {
		step(function accessCount1() {
			client.scard(domain + ":access", this);
		}, cb);
	};
};

Key.validate = function validateF(data, callback) {
	step(function () {
		if (data) {
			switch (data.type) {
			case "sym":
				SymKey.validate(data, this);
				break;
			case "sign":
			case "crypt":
				EccKey.validate(data, this);
				break;
			default:
				throw new InvalidKey();
			}
		} else {
			throw new InvalidKey();
		}
	});
};

Key.validateDecryptor = function validateDecryptorF(data, callback) {
	step(function () {
		var Decryptor = require("./decryptor");

		Decryptor.validate(data, this);
	}, callback);
};

Key.get = function getKF(realid, callback) {
	step(function () {
		client.get("key:" + realid, this);
	}, h.sF(function (type) {
		switch (type) {
		case "symkey":
			this.last.ne(new SymKey(realid));
			break;
		case "ecckey":
			this.last.ne(new EccKey(realid));
			break;
		default:
			this.last.ne(false);
			break;
		}
	}), callback);
};

Key.getKeys = function getKeysF(realids, callback) {
	step(function () {
		var i;
		for (i = 0; i < realids.length; i += 1) {
			Key.get(realids[i], this.parallel());
		}
	}, callback);
};

module.exports = Key;