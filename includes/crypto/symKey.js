"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var SymKey = function (keyRealID) {
	var Key = require("./Key");

	var key = new Key(keyRealID);

	this.isSymKey = function () {
		return true;
	};

	this.isEccKey = function () {
		return false;
	};

	this.getKData = key.getBasicData;

	/** getter for keyRealID */
	this.getRealID = key.getRealID;

	this.getType = key.getType;

	this.getOwner = key.getOwner;

	this.getDecryptors = key.getDecryptors;

	this.getDecryptorsJSON = key.getDecryptorsJSON;

	this.addDecryptor = key.addDecryptor;

	this.addDecryptors = key.addDecryptors;

	this.addEncryptor = key.addEncryptor;

	this.getAllAccessedParents = key.getAllAccessedParents;

	this.addAccess = key.addAccess;

	this.hasUserAccess = key.hasUserAccess;

	this.hasAccess = key.hasAccess;

	this.getAccess = key.getAccess;

	this.acessCount = key.accessCount;
};

SymKey.validate = function validateF(data, cb) {
	step(function () {
		if (!data) {
			throw new InvalidSymKey("no data");
		}

		if (!h.isRealID(data.realid)) {
			throw new InvalidRealID();
		}

		if (data.type !== "sym") {
			throw new InvalidSymKey("wrong type");
		}

		this.ne();
	}, cb);
};

/** get all decryptors for a certain key id */
SymKey.get = function getF(keyRealID, cb) {
	step(function () {
			if (!h.isRealID(keyRealID)) {
				throw new InvalidRealID();
			}

			client.get("key:" + keyRealID, this);
	}, h.sF(function (keyData) {
		if (keyData === "symkey") {
			this.ne(new SymKey(keyRealID));
		} else {
			throw new NotASymKey();
		}
	}), cb);
};

SymKey.createWDecryptors = function (view, data, cb) {
	step(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidSymKey("no decryptors given");
		}

		SymKey.create(view, data, this);
	}, cb);
};

/** create a symmetric key */
SymKey.create = function (view, data, cb) {
	var keyRealID, theKey;
	step(function () {
		SymKey.validate(data, this);
	}, h.sF(function () {
		keyRealID = data.realid;

		client.setnx("key:" + keyRealID, "symkey", this);
	}), h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		client.set("key:" + keyRealID + ":owner", view.getUserID(), this.parallel());
		client.set("key:" + keyRealID + ":type", data.type, this.parallel());
	}), h.sF(function () {
		theKey = new SymKey(keyRealID);
		if (data.decryptors) {
			theKey.addDecryptors(view, data.decryptors, this);
		} else {
			this.last.ne(theKey);
		}
	}), h.sF(function () {
		this.last.ne(theKey);
	}), cb);
};

module.exports = SymKey;