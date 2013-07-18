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
		
	};

	this.addAccess = function addAccessF(decryptorid, userid, cb, added) {
		step(function () {
			if (!added) {
				added = [];
			}

			if (added.indexOf(keyRealID) > -1) {
				console.log("loop!");
				this.last.ne();
			} else {
				client.sadd(domain + ":access", userid, this.parallel());
				client.sadd(domain + ":accessVia:" + userid, decryptorid, this.parallel());

				added.push(keyRealID);
			}
			//TODO: add access to encryptors!
		}, cb);
	};

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