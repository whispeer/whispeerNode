"use strict";

var Bluebird = require("bluebird")
var client = require("../redisClient");
var h = require("whispeerHelper");
var Key = require("./Key");

var Decryptor = require("./decryptor");

var EccKey = function (keyRealID) {
	if (!h.isRealID(keyRealID)) {
		throw new InvalidRealID();
	}

	this._realid = keyRealID;
	this._domain = "key:" + keyRealID;

};

EccKey.prototype = new Key();

EccKey.prototype.isSymKey = function () {
	return false;
};

EccKey.prototype.isEccKey = function () {
	return true;
};

EccKey.prototype.getCurve = function (cb) {
	return this._getAttribute("curve").nodeify(cb);
};

EccKey.prototype.getPointX = function () {
	return this._getAttribute("x")
};

EccKey.prototype.getPointY = function () {
	return this._getAttribute("y")
};

EccKey.prototype.getPoint = function (cb) {
	return Bluebird.all([
		this.getPointX(),
		this.getPointY(),
	]).then(function (data) {
		return {
			x: data[0],
			y: data[1]
		}
	}).nodeify(cb);
};

EccKey.prototype.getKData = function (request, wDecryptors) {
	var theKey = this;
	var result;
	return Bluebird.all([
		theKey.getPoint(),
		theKey.getCurve(),
		theKey.getBasicData(request, wDecryptors)
	]).spread(function (point, curve, basic) {
		result = basic;
		result.point = point;
		result.curve = curve;

		return result;
	})
};

function validateFormat(data) {
	if (!h.isRealID(data.realid)) {
		return new InvalidRealID();
	}

	if (!data || !data.curve || !data.point || !data.point.x || !data.point.y || !h.isHex(data.point.x) || !h.isHex(data.point.y) || !h.isCurve(data.curve)) {
		return new InvalidEccKey("Missing data");
	}

	if (data.type !== "sign" && data.type !== "crypt") {
		return new InvalidEccKey("wrong type");
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

EccKey.validate = function (data) {
	var err = validateFormat(data);
	if (err) {
		throw err;
	}
};

EccKey.validateNoThrow = function (data) {
	return !validateFormat(data)
};

/** get all decryptors for a certain key id */
EccKey.get = function getF(keyRealID, cb) {
	return Bluebird.try(() => {
		if (h.isRealID(keyRealID)) {
			return client.hgetAsync("key:" + keyRealID, "type")
		}

		throw new InvalidRealID(keyRealID);
	}).then(function (type) {
		if (type === "crypt" || type === "sign") {
			return new EccKey(keyRealID)
		}

		throw new NotAEccKey();
	}).nodeify(cb);
};

/** create a symmetric key */
EccKey.create = function (request, data, cb) {
	var domain, keyRealID, theKey;

	return Bluebird.try(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidEccKey();
		}

		EccKey.validate(data);

		keyRealID = data.realid;
		domain = "key:" + keyRealID;

		return client.setnxAsync(domain + ":used", "1");
	}).then(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		return client.hmsetAsync(domain, {
			curve: data.curve,
			x: data.point.x,
			y: data.point.y,
			type: data.type,
			owner: request.session.getUserID(),
			comment: data.comment || ""
		});
	}).then(function () {
		theKey = new EccKey(keyRealID);

		if (data.decryptors) {
			return theKey.addDecryptors(request, data.decryptors).thenReturn(theKey);
		}

		return Bluebird.resolve(theKey)
	}).nodeify(cb);
};

module.exports = EccKey;
