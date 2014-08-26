"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var Decryptor = function (keyRealID, count) {
	var domain = "key:" + keyRealID + ":decryptor:" + count;

	function getAttribute(attr, cb) {
		client.hget(domain, attr, cb);
	}

	/** getter for counter attribute */
	this.getID = function getIDF() {
		return count;
	};

	this.getDecryptorID = function getRealIDF(cb) {
		getAttribute("decryptorid", cb);
	};

	this.getDecryptorKey = function getDecryptorKeyF(cb) {
		step(function () {
			getAttribute("decryptorid", this);
		}, h.sF(function (decryptorid) {
			if (decryptorid) {
				var KeyApi = require("./KeyApi");
				KeyApi.get(decryptorid, this);
			} else {
				this.last.ne();
			}
		}), cb);
	};

	/** get the type of this decryptor */
	this.getType = function getTypeF(cb) {
		getAttribute("type", cb);
	};

	/** get the json data for this decryptor */
	this.getJSON = function getJSONF(cb) {
		client.hgetall(domain, cb);
	};

	/** remove this decryptors data */
	this.removeData = function delF(m, cb) {

		step(function () {
			client.hget("key:" + keyRealID + ":decryptor:" + count, "decryptorid", this);
		}, h.sF(function (decryptorid) {
			m.srem("key:" + keyRealID + ":decryptor:decryptorSet", count);
			m.del(domain);

			if (decryptorid) {
				m.hdel("key:" + keyRealID + ":decryptor:map", decryptorid);
			}

			this.ne();
		}), cb);
	};
};

Decryptor.getAllWithAccess = function getAllWAF(request, keyRealID, cb) {
	step(function () {
		request.session.logedinError(this);
	}, h.sF(function () {
		if (!h.isRealID(keyRealID)) {
			throw new InvalidRealID();
		}

		client.smembers("key:" + keyRealID + ":accessVia:" + request.session.getUserID(), this);
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
		this.ne(decryptorSet.map(function (count) {
			return new Decryptor(keyRealID, count);
		}));
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

Decryptor.validateNoThrow = function validateF(request, data, key, cb) {
	step(function validate() {
		Decryptor.validate(request, data, key, this);
	}, function validate2(e) {
		if (e) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}, cb);
};

Decryptor.validate = function validateF(request, data, key, cb) {
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
		key.hasAccess(request, this.parallel());

		if (typeof parentKey === "object") {
			parentKey.hasAccess(request, this.parallel());
			parentKey.getType(this.parallel());
		} else {
			this.parallel()(null, true);
		}
	}), h.sF(function createD22(keyAcc, parentAcc, parentType) {
		if (keyAcc === true && (parentAcc === true || parentType === "crypt")) {
			//is there already a key like this one?
			client.hget("key:" + keyRealID + ":decryptor:map", data.decryptorid, this);
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
Decryptor.create = function (request, key, data, cb) {
	var decryptorInternalID, keyRealID = key.getRealID(), parentKey;

	step(function createD1() {
		//only allow key creation when logged in
		request.session.logedinError(this);
	}, h.sF(function createD12() {
		//validate our decryptor
		Decryptor.validate(request, data, key, this);
	}), h.sF(function createD2(p) {
		parentKey = p;

		client.incr("key:" + keyRealID + ":decryptor:count", this);
	}), h.sF(function createD24(count) {
		decryptorInternalID = count;

		var domain = "key:" + keyRealID + ":decryptor:" + count;

		if (data.type !== "pw") {
			//add the decryptors id to the list
			client.hset("key:" + keyRealID + ":decryptor:map", data.decryptorid, count, this.parallel());
		}

		var toSet = {
			ct: data.ct,
			type: data.type,
			creator: request.session.getUserID()
		};

		//set decryptorid if applicable
		if (data.decryptorid) {
			toSet.decryptorid = data.decryptorid;
		}

		//set iv if applicable
		if (data.iv) {
			toSet.iv = data.iv;
		}

		//set salt if applicable
		if (data.salt) {
			toSet.salt = data.salt;
		}

		client.hmset(domain, toSet, this.parallel());

		//add to list. we need this to grab all decryptors.
		client.sadd("key:" + keyRealID + ":decryptor:decryptorSet", decryptorInternalID, this.parallel());
	}), h.sF(function createD4() {
		if (data.type === "pw") {
			this.ne([request.session.getUserID()]);
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