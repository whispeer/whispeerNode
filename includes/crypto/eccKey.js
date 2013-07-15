"use strict";

/* global require, module, console, StepError, NotLogedin, InvalidLogin, AccessViolation, InvalidToken, UserNotExisting, MailInUse, NicknameInUse, InvalidPassword, InvalidAttribute, LostDecryptor, InvalidDecryptor, RealIDInUse, InvalidRealID, NotASymKey, InvalidSymKey, NotAEccKey, InvalidEccKey,  */

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

	this.getDecryptors = key.getDecryptors;

	this.addDecryptor = key.addDecryptor;

	this.addDecryptors = key.addDecryptors;

	this.addEncryptor = key.addEncryptor;

	this.addAccess = key.addAccess;

	this.hasAccess = key.hasAccess;

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
	});
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
EccKey.create = function (view, data, cb) {
	var domain, keyRealID;

	//TODO: check data.type for correctness
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
		client.set(domain + ":owner", view.getUserID(), this.parallel());
	}), h.sF(function () {
		this.ne(new EccKey(keyRealID));
	}), cb);
};

module.exports = EccKey;