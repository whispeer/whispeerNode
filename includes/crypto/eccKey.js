"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");
var Key = require("./Key");

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

EccKey.prototype.getCurve = function getCurveF(cb) {
	this._getAttribute("curve", cb);
};

EccKey.prototype.getPointX = function getPointXF(cb) {
	this._getAttribute("x", cb);
};

EccKey.prototype.getPointY = function getPointYF(cb) {
	this._getAttribute("y", cb);
};

EccKey.prototype.getPoint = function getPointF(cb) {
	var theKey = this;
	step(function () {
		theKey.getPointX(this.parallel());
		theKey.getPointY(this.parallel());
	}, h.sF(function (data) {
		this.ne({
			x: data[0],
			y: data[1]
		});
	}), cb);
};

EccKey.prototype.getKData = function getKDataF(request, cb, wDecryptors) {
	var theKey = this;
	var result;
	step(function () {
		this.parallel.unflatten();
		theKey.getPoint(this.parallel());
		theKey.getCurve(this.parallel());
		theKey.getBasicData(request, this.parallel(), wDecryptors);
	}, h.sF(function (point, curve, basic) {
		result = basic;
		result.point = point;
		result.curve = curve;

		this.last.ne(result);
	}), cb);
};

function validate(data, cb) {
	step(function () {
		if (!h.isRealID(data.realid)) {
			this.ne(new InvalidRealID());
		}

		if (!data || !data.curve || !data.point || !data.point.x || !data.point.y || !h.isHex(data.point.x) || !h.isHex(data.point.y) || !h.isCurve(data.curve)) {
			this.ne(new InvalidEccKey("Missing data"));
		}

		if (data.type !== "sign" && data.type !== "crypt") {
			this.ne(new InvalidEccKey("wrong type"));
		}

		this.ne();
	}, cb);
}

EccKey.validate = function validateF(data, cb) {
	step(function () {
		validate(data, this);
	}, h.sF(function (e) {
		this(e);
	}), cb);
};

EccKey.validateNoThrow = function validateF(data, cb) {
	step(function () {
		validate(data, this);
	}, h.sF(function (e) {
		if (e) {
			this.ne(false);
		} else {
			this.ne(true);
		}
	}), cb);
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