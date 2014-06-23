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
	this._getAttribute(":curve", cb);
};

EccKey.prototype.getPointX = function getPointXF(cb) {
	this._getAttribute(":point:x", cb);
};

EccKey.prototype.getPointY = function getPointYF(cb) {
	this._getAttribute(":point:y", cb);
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

EccKey.prototype.getKData = function getKDataF(view, cb, wDecryptors) {
	var theKey = this;
	var result;
	step(function () {
		this.parallel.unflatten();
		theKey.getPoint(this.parallel());
		theKey.getCurve(this.parallel());
		theKey.getBasicData(view, this.parallel(), wDecryptors);
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
			client.get("key:" + keyRealID, this);
		} else {
			throw new InvalidRealID(keyRealID);
		}
	}, h.sF(function (keyData) {
		if (keyData === "ecckey") {
			this.ne(new EccKey(keyRealID));
		} else {
			throw new NotAEccKey();
		}
	}), cb);
};

EccKey.createWDecryptors = function (view, data, cb) {
	step(function () {
		if (!data.decryptors || data.decryptors.length === 0) {
			throw new InvalidEccKey();
		}

		EccKey.create(view, data, this);
	}, cb);
};


/** create a symmetric key */
EccKey.create = function (view, data, cb) {
	var domain, keyRealID, theKey;

	step(function () {
		EccKey.validate(data, this);
	}, h.sF(function () {
		keyRealID = data.realid;
		domain = "key:" + keyRealID;

		client.setnx(domain, "ecckey", this);
	}), h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		client.set(domain + ":curve", data.curve, this.parallel());
		client.set(domain + ":point:x", data.point.x, this.parallel());
		client.set(domain + ":point:y", data.point.y, this.parallel());
		client.set(domain + ":type", data.type, this.parallel());
		client.set(domain + ":owner", view.session.getUserID(), this.parallel());
		client.set(domain + ":comment", data.comment || "", this.parallel());
	}), h.sF(function () {
		theKey = new EccKey(keyRealID);
		if (data.decryptors) {
			theKey.addDecryptors(view, data.decryptors, this);
		} else {
			this.last.ne(theKey);
		}
	}), h.sF(function () {
		this.ne(theKey);
	}), cb);
};

module.exports = EccKey;