"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

var EccKey = function (keyRealID) {
	var Key = require("./Key");

	var key = new Key(keyRealID);
	var theKey = this;
	var domain = "key:" + keyRealID;

	function getAttribute(attr, cb) {
		step(function () {
			client.get(domain + attr, this);
		}, cb);
	}

	this.isSymKey = function () {
		return false;
	};

	this.isEccKey = function () {
		return true;
	};

	/** getter for keyRealID */
	this.getRealID = key.getRealID;

	this.getOwner = key.getOwner;

	this.getCurve = function getCurveF(cb) {
		getAttribute(":curve", cb);
	};

	this.getPointX = function getPointXF(cb) {
		getAttribute(":point:x", cb);
	};

	this.getPointY = function getPointYF(cb) {
		getAttribute(":point:y", cb);
	};

	this.getPoint = function getPointF(cb) {
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

	this.getKData = function getKDataF(view, cb, wDecryptors) {
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

	this.getDecryptorsJSON = key.getDecryptorsJSON;

	this.getBasicData = key.getBasicData;

	this.getDecryptors = key.getDecryptors;

	this.addDecryptor = key.addDecryptor;

	this.addDecryptors = key.addDecryptors;

	this.addEncryptor = key.addEncryptor;

	this.getAllAccessedParents = key.getAllAccessedParents;

	this.addAccess = key.addAccess;

	this.hasAccess = key.hasAccess;

	this.getAccess = key.getAccess;

	this.acessCount = key.accessCount;
};

EccKey.validate = function validateF(data, cb) {
	step(function () {
		if (!h.isRealID(data.realid)) {
			throw new InvalidRealID();
		}

		if (!data || !data.curve || !data.point || !data.point.x || !data.point.y || !h.isHex(data.point.x) || !h.isHex(data.point.y) || !h.isCurve(data.curve)) {
			throw new InvalidEccKey("Missing data");
		}

		if (data.type !== "sign" && data.type !== "crypt") {
			throw new InvalidEccKey("wrong type");
		}

		this.ne();
	}, cb);
};

/** get all decryptors for a certain key id */
EccKey.get = function getF(keyRealID, cb) {
	//TODO check keyRealID is a valid keyRealID!
	step(function () {
		client.get("key:" + keyRealID, this);
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
		client.set(domain + ":owner", view.getUserID(), this.parallel());
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