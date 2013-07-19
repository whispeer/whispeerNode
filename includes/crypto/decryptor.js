/* global require, module, console, StepError, NotLogedin, InvalidLogin, AccessViolation, InvalidToken, UserNotExisting, MailInUse, NicknameInUse, InvalidPassword, InvalidAttribute, LostDecryptor, InvalidDecryptor, RealIDInUse, InvalidRealID, NotASymKey, InvalidSymKey, NotAEccKey, InvalidEccKey,  */

"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

var Decryptor = function (keyRealID, decryptorRealID, userid) {
	var domain = "key:" + keyRealID + ":decryptor:" + decryptorRealID + ":" + userid;

	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	/** getter for counter attribute */
	this.getDecryptorRealID = function getDecryptorRealIDF() {
		return decryptorRealID;
	};

	/** getter for counter attribute */
	this.getUser = function getUserIDF() {
		return userid;
	};

	var type, secret, theDecryptor = this;

	/** get the type of this decryptor */
	this.getType = function getTypeF(cb) {
		step(function () {
			if (type) {
				this.last.ne(type);
			} else {
				client.get(domain + ":type", this);
			}
		}, h.sF(function (theType) {
			if (!theType) {
				throw new LostDecryptor();
			}

			type = theType;

			this.last.ne(type);
		}), cb);
	};

	/** get the secret */
	this.getSecret = function getSecretF(cb) {
		step(function () {
			if (secret) {
				this.last.ne(secret);
			} else {
				client.get(domain + ":secret", this);
			}
		}, h.sF(function (theSecret) {
			if (!theSecret) {
				throw new LostDecryptor();
			}

			secret = theSecret;

			this.last.ne(secret);
		}), cb);
	};

	/** get the json data for this decryptor */
	this.getJSON = function getJSONF(cb) {
		step(function getDecryptorData() {
			theDecryptor.getSecret(this.parallel());
			theDecryptor.getType(this.parallel());
		}, h.sF(function theDecryptorData(result) {
			var jsonData;
			if (result[1]) {
				jsonData = {
					secret: result[0],
					decryptorid: decryptorRealID,
					decryptortype: result[1]
				};
			} else {
				jsonData = {
					secret: result[0],
					decryptortype: result[1]
				};
			}

			this.ne(jsonData);
		}), cb);
	};

	/** delete this decryptor */
	this.del = function delF(cb) {
		step(function () {
			client.sdel("key:" + keyRealID + ":decryptor:decryptorSet", decryptorRealID, this.parallel());
			client.sdel("key:" + keyRealID + ":decryptor:" + decryptorRealID + ":decryptorSet", userid, this.parallel());
			client.del(domain + ":secret", this.parallel());
			client.del(domain + ":type", this.parallel());
		}, h.sF(function () {
			//do not pass out results.
			this.ne();
		}), cb);
	};
};

Decryptor.getAllWithAccess = function getAllWAF(view, keyRealID, cb) {
	//TODO
};

/** get all decryptors for a certain key id */
Decryptor.getAll = function getAllF(keyRealID, cb) {
	var decryptors = [];
	//TODO check keyRealID is a valid keyRealID!
	step(function () {
		client.smembers("key:" + keyRealID + ":decryptor:decryptorSet", this);
	}, h.sF(function (decryptorSet) {
		var i;
		for (i = 0; i < decryptorSet.length; i += 1) {
			client.smembers("key:" + keyRealID + ":decryptor:" + decryptorSet[i] + ":decryptorSet", this.parallel());
			decryptors.push(keyRealID);
		}
	}), h.sF(function (decryptorSet) {
		var results = [];

		var i, j;
		for (i = 0; i < decryptorSet.length; i += 1) {
			for (j = 0; j < decryptorSet[i].length; j += 1) {
				results.push(new Decryptor(keyRealID, decryptors[i], decryptorSet[i][j]));
			}
		}

		this.ne(results);
	}), cb);
};

Decryptor.validate = function validateF(data, cb) {
	step(function validateF1() {
		//data needs to be existing and ct needs to be hex
		if (!data || !h.isHex(data.ct)) {
			throw new InvalidDecryptor("data or secret missing");
		}

		//if not pw we need a realid.
		if (data.type !== "pw" && (!data.decryptorid || !h.isRealID(data.decryptorid))) {
			throw new InvalidDecryptor("key id missing");
		}

		// if pw or symkey, we need a hex iv
		if ((data.type === "pw" || data.type === "symKey") && !h.isHex(data.iv)) {
			throw new InvalidDecryptor("invalid iv");
		}

		//if pw we need a hex salt
		if (data.type === "pw" && !h.isHex(data.salt)) {
			throw new InvalidDecryptor("invalid salt");
		}

		//find dat key
		if (data.type === "symKey") {
			var SymKey = require("./symKey.js");
			SymKey.get(data.decryptorid, this);
		} else if (data.type === "cryptKey") {
			var EccKey = require("./eccKey.js");
			EccKey.get(data.decryptorid, this);
		} else if (data.type === "pw") {
			this.ne(true);
		} else {
			throw new InvalidDecryptor("invalid type.");
		}
	}, h.sF(function validateF2(key) {
		if (!key) {
			throw new InvalidDecryptor("key not found.");
		}

		this.ne(key);
	}), cb);
};

/** create a decryptor */
Decryptor.create = function (view, key, data, cb) {
	var userid, decryptorInternalID, keyRealID = key.getRealID(), parentKey;

	step(function createD1() {
		//only allow key creation when logged in
		view.logedinError(this);
	}, h.sF(function createD12() {
		//validate our decryptor
		Decryptor.validate(data, this);
	}), h.sF(function createD2(p) {
		parentKey = p;

		key.hasAccess(view, this.parallel());

		if (typeof parentKey === "object") {
			parentKey.hasAccess(view, this.parallel());
		} else {
			this.parallel()(null, true);
		}
	}), h.sF(function createD22(access) {
		if (access[0] === true && access[1] === true) {
			//is there already a key like this one?
			client.get("key:" + keyRealID + ":decryptor:map:" + data.decryptorid, this);
		} else {
			throw new AccessViolation("No Access here! " + access[0] + "-" + access[1]);
		}
	}), h.sF(function createD23(val) {
		if (val !== null) {
			throw new InvalidDecryptor("already existing");
		}

		client.incr("key:" + keyRealID + ":decryptor:count", this);
	}), h.sF(function createD24(count) {
		decryptorInternalID = count;

		var domain = "key:" + keyRealID + ":decryptor:" + count;

		if (data.type !== "pw") {
			//add the decryptors id to the list
			client.set("key:" + keyRealID + ":decryptor:map:" + data.decryptorid, count, this.parallel());
		}

		//set secret and type
		client.set(domain + ":secret", data.ct, this.parallel());
		client.set(domain + ":type", data.type, this.parallel());

		//set decryptorid if applicable
		if (data.decryptorid) {
			client.set(domain + ":decryptorid", data.decryptorid, this.parallel());
		}

		//set iv if applicable
		if (data.iv) {
			client.set(domain + ":iv", data.iv, this.parallel());
		}

		//set salt if applicable
		if (data.salt) {
			client.set(domain + ":salt", data.salt, this.parallel());
		}

		//add to list. we need this to grab all decryptors.
		client.sadd("key:" + keyRealID + ":decryptor:decryptorSet", decryptorInternalID, this.parallel());

		//user stuff
		userid = view.getUserID();

		client.set(domain + ":creator", userid, this.parallel());
	}), h.sF(function createD4() {
		//TODO: update keys access rights. (or let the key do that?)

		if (data.type === "pw") {
			this.ne([userid]);
		} else {
			parentKey.getAccess(this);
		}
	}), h.sF(function createD41(access) {
		if (typeof parentKey === "object") {
			parentKey.addEncryptor(keyRealID, this.parallel());
		}

		key.addAccess(decryptorInternalID, access, this.parallel());
	}), h.sF(function createD5() {
		this.ne(new Decryptor(keyRealID, data.decryptorid, userid));
	}), cb);
};

module.exports = Decryptor;