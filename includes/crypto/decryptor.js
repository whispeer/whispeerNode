/* global require, LostDecryptor, console, module, InvalidDecryptor */

"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

require("../errors");

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

/** create a decryptor */
Decryptor.create = function (view, keyRealID, data, cb) {
	var userid, keyInternalID;
	//TODO: check keyRealID for correctness
	step(function createD1() {
		userid = view.getUserID();

		if (!data || !data.ct || !data.type) {
			throw new InvalidDecryptor("secret or type or key id missing");
		}

		if (data.type !== "pw" && (!data.decryptorid || !h.isRealID(data.decryptorid))) {
			throw new InvalidDecryptor("secret or type or key id missing");
		}

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

		//TODO: make type checks for the given data.
	}, h.sF(function createD2(key) {
		if (!key) {
			throw new InvalidDecryptor("key not found.");
		}

		client.incr("key:" + keyRealID + ":decryptor:count", this);
	}), h.sF(function createD22(count) {
		keyInternalID = count;

		var domain = "key:" + keyRealID + ":decryptor:" + count;
		client.set(domain + ":secret", data.ct, this.parallel());
		client.set(domain + ":type", data.type, this.parallel());
		client.set(domain + ":decryptorid", data.decryptorid, this.parallel());

		if (data.iv) {
			client.set(domain + ":iv", data.iv, this.parallel());
		}

		if (data.salt) {
			client.set(domain + ":salt", data.salt, this.parallel());
		}

	}), h.sF(function createD3() {
		client.sadd("key:" + keyRealID + ":decryptor:decryptorSet", keyInternalID, this);
		//client.sadd("key:" + keyRealID + ":decryptor:" + data.decryptorid + ":decryptorSet", data.userid, this.parallel());
	}), h.sF(function createD4(success) {
		if (success[0] === 0 || success[1] === 0) {
			console.err("decryptor already existing:" + data.decryptorid + "-" + userid + "-" + keyRealID);
		}

		this.ne(new Decryptor(keyRealID, data.decryptorid, userid));
	}), cb);
};

module.exports = Decryptor;