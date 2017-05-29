"use strict";

const Bluebird = require("bluebird")
const h = require("whispeerHelper");

const client = require("../redisClient");

const Key = require("./Key");

const Decryptor = require("./decryptor");

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

SymKey.prototype.check = function (errors, cb) {
	cb();
};

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

SymKey.validate = function (data) {
	var err = validateFormat(data);
	if (err) {
		throw err;
	}
};

SymKey.validateNoThrow = function (data, cb) {
	return Bluebird.try(function () {
		if (validateFormat(data)) {
			return false
		}

		return true
	}).nodeify(cb);
};


/** get all decryptors for a certain key id */
SymKey.get = function getF(keyRealID, cb) {
	return Bluebird.try(() => {
			if (!h.isRealID(keyRealID)) {
				throw new InvalidRealID();
			}

			return client.hgetAsync("key:" + keyRealID, "type");
	}).then((type) => {
		if (type === "sym") {
			return new SymKey(keyRealID);
		}

		throw new NotASymKey(keyRealID);
	}).nodeify(cb);
};

/** create a symmetric key */
SymKey.create = function (request, data, cb) {
	var keyRealID, theKey;
	return Bluebird.try(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidSymKey("no decryptors given");
		}

		SymKey.validate(data);

		keyRealID = data.realid;

		return client.setnxAsync("key:" + keyRealID + ":used", "1");
	}).then((set) => {
		if (set === 0) {
			throw new RealIDInUse();
		}

		return client.hmsetAsync("key:" + keyRealID, {
			owner: request.session.getUserID(),
			type: data.type,
			comment: data.comment || ""
		});
	}).then(() => {
		theKey = new SymKey(keyRealID);
		if (data.decryptors) {
			return theKey.addDecryptors(request, data.decryptors).thenReturn(theKey);
		}

		return Bluebird.resolve(theKey)
	}).nodeify(cb)
};

module.exports = SymKey;
