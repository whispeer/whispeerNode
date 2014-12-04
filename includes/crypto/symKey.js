"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var Key = require("./Key");

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

SymKey.validateNoThrow = function validateF(data, cb) {
	step(function () {
		SymKey.validate(data, this);
	}, function (e) {
		if (e) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}, cb);
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

		//TODO: validate decryptors!

		this.ne();
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