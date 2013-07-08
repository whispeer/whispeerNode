"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

require("../errors");

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

	this.addDecryptor = function addDecryptorF(view, data, cb) {
		step(function () {
			var Decryptor = require("./decryptor");
			Decryptor.create(view, keyRealID, data, this);
		}, cb);
	};

	this.addDecryptors = function addDecryptorF(view, data, cb) {
		step(function () {
			var Decryptor = require("./decryptor"), i;
			for (i = 0; i < data.length; i += 1) {
				Decryptor.create(view, keyRealID, data[i], this.parallel());
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


/** create a symmetric key */
EccKey.create = function (view, keyRealID, data, cb) {
	//TODO: check keyRealID for correctness
	//TODO: check data.type for correctness
	step(function () {
		client.setnx("key:" + keyRealID, "ecckey", this);
	}, h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		debugger;

		if (!data || !data.curve || !data.point || !data.point.x || !data.point.y || !h.isHex(data.point.x) || !h.isHex(data.point.y) || !h.isCurve(data.curve)) {
			console.log("data missing!");
			console.log(data);
			throw new InvalidEccKey("Missing data");
		}

		client.set("key:" + keyRealID + ":curve", data.curve, this.parallel());
		client.set("key:" + keyRealID + ":point:x", data.point.x, this.parallel());
		client.set("key:" + keyRealID + ":point:y", data.point.y, this.parallel());

		this.ne(new EccKey(keyRealID));
	}), cb);
};

module.exports = EccKey;