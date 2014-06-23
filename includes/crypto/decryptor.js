"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var Decryptor = function (keyRealID, count) {
	var domain = "key:" + keyRealID + ":decryptor:" + count;

	function getAttribute(attr, cb) {
		step(function () {
			client.get(domain + attr, this);
		}, cb);
	}

	/** getter for counter attribute */
	this.getID = function getIDF() {
		return count;
	};

	var theDecryptor = this;

	this.getDecryptorID = function getRealIDF(cb) {
		getAttribute(":decryptorid", cb);
	};

	this.getDecryptorKey = function getDecryptorKeyF(cb) {
		step(function () {
			getAttribute(":decryptorid", this);
		}, h.sF(function (decryptorid) {
			if (decryptorid) {
				var KeyApi = require("./KeyApi");
				KeyApi.get(decryptorid, this);
			} else {
				this.last.ne();
			}
		}), cb);
	};

	this.getIV = function getIVF(cb) {
		getAttribute(":iv", cb);
	};

	this.getSalt = function getSaltF(cb) {
		getAttribute(":salt", cb);
	};

	this.getCreator = function getCreatorF(cb) {
		getAttribute(":creator", cb);
	};

	/** get the type of this decryptor */
	this.getType = function getTypeF(cb) {
		getAttribute(":type", cb);
	};

	/** get the secret */
	this.getSecret = function getSecretF(cb) {
		getAttribute(":secret", cb);
	};

	/** get the json data for this decryptor */
	this.getJSON = function getJSONF(cb) {
		var result = {};
		step(function getDecryptorData() {
			this.parallel.unflatten();
			theDecryptor.getSecret(this.parallel());
			theDecryptor.getType(this.parallel());
			theDecryptor.getCreator(this.parallel());

			theDecryptor.getDecryptorID(this.parallel());
			theDecryptor.getIV(this.parallel());
			theDecryptor.getSalt(this.parallel());
		}, h.sF(function theDecryptorData(ct, type, creator, decryptorid, iv, salt) {
			result.ct = ct;
			result.type = type;
			result.creator = creator;
		
			if (decryptorid) {
				result.decryptorid = decryptorid;
			}

			if (iv) {
				result.iv = iv;
			}

			if (salt) {
				result.salt = salt;
			}

			this.ne(result);
		}), cb);
	};

	/** delete this decryptor */
	this.del = function delF(cb) {
		step(function () {
			client.sdel("key:" + keyRealID + ":decryptor:decryptorSet", count, this.parallel());

			client.del(domain + ":secret", this.parallel());
			client.del(domain + ":salt", this.parallel());
			client.del(domain + ":iv", this.parallel());
			client.del(domain + ":decryptorid", this.parallel());
			client.del(domain + ":type", this.parallel());
		}, h.sF(function () {
			//do not pass out results.
			this.ne();
		}), cb);
	};
};

Decryptor.getAllWithAccess = function getAllWAF(view, keyRealID, cb) {
	step(function () {
		view.logedinError(this);
	}, h.sF(function () {
		if (!h.isRealID(keyRealID)) {
			throw new InvalidRealID();
		}

		client.smembers("key:" + keyRealID + ":accessVia:" + view.session.getUserID(), this);
	}), h.sF(function (decryptorSet) {
		var results = [];
		var i;
		for (i = 0; i < decryptorSet.length; i += 1) {
			results.push(new Decryptor(keyRealID, decryptorSet[i]));
		}

		this.ne(results);
	}), cb);
};

/** get all decryptors for a certain key id */
Decryptor.getAll = function getAllF(keyRealID, cb) {
	step(function () {
		if (!h.isRealID(keyRealID)) {
			throw new InvalidRealID();
		}

		client.smembers("key:" + keyRealID + ":decryptor:decryptorSet", this);
	}, h.sF(function (decryptorSet) {
		var results = [];
		var i;
		for (i = 0; i < decryptorSet.length; i += 1) {
			results.push(new Decryptor(keyRealID, decryptorSet[i]));
		}

		this.ne(results);
	}), cb);
};

Decryptor.validateFormat = function validateFormat(data) {
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

	if (["symKey", "cryptKey", "pw"].indexOf(data.type) === -1) {
		throw new InvalidDecryptor("invalid type.");
	}
};

Decryptor.validateNoThrow = function validateF(view, data, key, cb) {
	step(function validate() {
		Decryptor.validate(view, data, key, this);
	}, function validate2(e) {
		if (e) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}, cb);
};

Decryptor.validate = function validateF(view, data, key, cb) {
	var keyRealID = key.getRealID();
	var parentKey;
	step(function validateF1() {
		Decryptor.validateFormat(data);

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
	}, h.sF(function validateF2(k) {
		parentKey = k;
		if (!key) {
			throw new InvalidDecryptor("key not found.");
		}

		this.parallel.unflatten();
		key.hasAccess(view, this.parallel());

		if (typeof parentKey === "object") {
			parentKey.hasAccess(view, this.parallel());
			parentKey.getType(this.parallel());
		} else {
			this.parallel()(null, true);
		}
	}), h.sF(function createD22(keyAcc, parentAcc, parentType) {
		if (keyAcc === true && (parentAcc === true || parentType === "crypt")) {
			//is there already a key like this one?
			client.get("key:" + keyRealID + ":decryptor:map:" + data.decryptorid, this);
		} else {
			throw new AccessViolation("No Access here! " + keyAcc + "-" + parentAcc + "("+ keyRealID + " - " + (parentKey.getRealID ? parentKey.getRealID() : "") + ")");
		}
	}), h.sF(function createD23(val) {
		if (val !== null) {
			throw new InvalidDecryptor("already existing");
		}

		this.ne(parentKey);
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
		Decryptor.validate(view, data, key, this);
	}), h.sF(function createD2(p) {
		parentKey = p;

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
		userid = view.session.getUserID();

		client.set(domain + ":creator", userid, this.parallel());
	}), h.sF(function createD4() {
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
		this.ne(new Decryptor(keyRealID, data.decryptorid));
	}), cb);
};

module.exports = Decryptor;