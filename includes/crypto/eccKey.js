"use strict";

var Bluebird = require("bluebird")
var step = require("step");
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

EccKey.prototype.getKData = function (request, cb, wDecryptors) {
	var theKey = this;
	var result;
	return Bluebird.all([
		theKey.getPoint(),
		theKey.getCurve(),
		Bluebird.fromCallback((cb) => {
			theKey.getBasicData(request, cb, wDecryptors)
		})
	]).spread(function (point, curve, basic) {
		result = basic;
		result.point = point;
		result.curve = curve;

		return result;
	}).nodeify(cb);
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

EccKey.validate = function validateF(data, cb) {
	var err = validateFormat(data);
	if (err) {
		throw err;
	} else {
		cb();
	}
};

EccKey.validateNoThrow = function validateF(data, cb) {
	step(function () {
		if (validateFormat(data)) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}, cb);
};

/** get all decryptors for a certain key id */
EccKey.get = function getF(keyRealID, cb) {
	step(function () {
		if (h.isRealID(keyRealID)) {
			client.hget("key:" + keyRealID, "type", this);
		} else {
			throw new InvalidRealID(keyRealID);
		}
	}, h.sF(function (type) {
		if (type === "crypt" || type === "sign") {
			this.ne(new EccKey(keyRealID));
		} else {
			throw new NotAEccKey();
		}
	}), cb);
};

EccKey.createWDecryptors = function (request, data, cb) {
	step(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidEccKey();
		}

		EccKey.create(request, data, this);
	}, cb);
};


/** create a symmetric key */
EccKey.create = function (request, data, cb) {
	var domain, keyRealID, theKey;

	step(function () {
		EccKey.validate(data, this);
	}, h.sF(function () {
		keyRealID = data.realid;
		domain = "key:" + keyRealID;

		client.setnx(domain + ":used", "1", this);
	}), h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		client.hmset(domain, {
			curve: data.curve,
			x: data.point.x,
			y: data.point.y,
			type: data.type,
			owner: request.session.getUserID(),
			comment: data.comment || ""
		}, this);
	}), h.sF(function () {
		theKey = new EccKey(keyRealID);
		if (data.decryptors) {
			theKey.addDecryptors(request, data.decryptors, this);
		} else {
			this.last.ne(theKey);
		}
	}), h.sF(function () {
		this.ne(theKey);
	}), cb);
};

module.exports = EccKey;
