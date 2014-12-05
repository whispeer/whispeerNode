"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var Key = require("./Key");

var Decryptor = require("./decryptor");

var SymKey = function (keyRealID) {
	if (!h.isRealID(keyRealID)) {
		throw new InvalidRealID();
	}

	this._realid = keyRealID;
	this._domain = "key:" + keyRealID;
};

SymKey.prototype = new Key();

SymKey.prototype.isSymKey = function () {
	return true;
};

SymKey.prototype.isEccKey = function () {
	return false;
};

SymKey.prototype.getKData = Key.prototype.getBasicData;

function validateFormat(data) {
	if (!data) {
		return new InvalidSymKey("no data");
	}

	if (!h.isRealID(data.realid)) {
		return new InvalidRealID();
	}

	if (data.type !== "sym") {
		return new InvalidSymKey("wrong type");
	}

	if (data.decryptors) {
		try {
			data.decryptors.forEach(function (decryptor) {
				Decryptor.validateFormat(decryptor);
			});
		} catch (e) {
			return e;
		}
	}
}

SymKey.validate = function validateF(data, cb) {
	var err = validateFormat(data);
	if (err) {
		throw err;
	} else {
		cb();
	}
};

SymKey.validateNoThrow = function validateF(data, cb) {
	step(function () {
		if (validateFormat(data)) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}, cb);
};


/** get all decryptors for a certain key id */
SymKey.get = function getF(keyRealID, cb) {
	step(function () {
			if (!h.isRealID(keyRealID)) {
				throw new InvalidRealID();
			}

			client.hget("key:" + keyRealID, "type", this);
	}, h.sF(function (type) {
		if (type === "sym") {
			this.ne(new SymKey(keyRealID));
		} else {
			throw new NotASymKey(keyRealID);
		}
	}), cb);
};

SymKey.createWDecryptors = function (request, data, cb) {
	step(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidSymKey("no decryptors given");
		}

		SymKey.create(request, data, this);
	}, cb);
};

/** create a symmetric key */
SymKey.create = function (request, data, cb) {
	var keyRealID, theKey;
	step(function () {
		SymKey.validate(data, this);
	}, h.sF(function () {
		keyRealID = data.realid;

		client.setnx("key:" + keyRealID + ":used", "1", this);
	}), h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		client.hmset("key:" + keyRealID, {
			owner: request.session.getUserID(),
			type: data.type,
			comment: data.comment || ""
		}, this);
	}), h.sF(function () {
		theKey = new SymKey(keyRealID);
		if (data.decryptors) {
			theKey.addDecryptors(request, data.decryptors, this);
		} else {
			this.last.ne(theKey);
		}
	}), h.sF(function () {
		this.last.ne(theKey);
	}), cb);
};

module.exports = SymKey;