var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

require("../errors");

"use strict";

var EccKey = function (keyRealID) {
	var theKey = this;

	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	this.getCurve = function getCurveF(cb) {
		step(function () {
			client.get("key:" + keyRealID + ":curve", this);
		}, cb);
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

	this.getPointX = function getPointXF(cb) {
		step(function () {
			client.get("key:" + keyRealID + ":point:x", this);
		}, cb);
	};

	this.getPointY = function getPointYF(cb) {
		step(function () {
			client.get("key:" + keyRealID + ":point:y", this);
		}, cb);
	};

	this.getDecryptors = function getDecryptorsF(cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			Decryptor.getAll(keyRealID, this);
		}, cb);
	};

	this.addDecryptor = function addDecryptorF(data, cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			Decryptor.create(keyRealID, data, this);
		}, cb);
	};

	this.addDecryptors = function addDecryptorF(data, cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			var i;
			for (i = 0; i < data.length; i += 1) {
				Decryptor.create(keyRealID, data[i], this.parallel());
			}
		}, cb);
	};
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

EccKey.createWithDecryptors = function createWithDecryptorsF(data, cb) {
	step(function () {
		if (data && data.realid && data.curve && data.point) {
			EccKey.create(data.realid, {
				curve: data.curve,
				point: data.point
			}, this);
		} else {
			throw new InvalidEccKey();
		}
	}, h.sF(function (theKey) {
		if (data.decryptors) {
			theKey.addDecryptors(data.decryptors, this);
		} else {
			this.ne(theKey);
		}
	}), cb);
};

/** create a symmetric key */
EccKey.create = function (keyRealID, data, cb) {
	//TODO: check keyRealID for correctness
	step(function () {
		client.setnx("key:" + keyRealID, "ecckey", this);
	}, h.sF(function (data) {
		if (data === 0) {
			throw new RealIDInUse();
		}

		if (!data || !data.curve || !data.point || !data.point.x || !data.point.y || !h.isHex(data.point.x) || !h.isHex(data.point.y) || !h.isCurve(data.curve)) {
			throw new InvalidEccKey("Missing data");
		}

		client.set("key:" + keyRealID + ":curve", data.curve, this.parallel());
		client.set("key:" + keyRealID + ":point:x", data.point.x, this.parallel());
		client.set("key:" + keyRealID + ":point:y", data.point.y, this.parallel());

		this.ne(new EccKey(keyRealID));
	}), cb);
};