"use strict";

/* global require, module, console, StepError, NotLogedin, InvalidLogin, AccessViolation, InvalidToken, UserNotExisting, MailInUse, NicknameInUse, InvalidPassword, InvalidAttribute, LostDecryptor, InvalidDecryptor, RealIDInUse, InvalidRealID, NotASymKey, InvalidSymKey, NotAEccKey, InvalidEccKey,  */

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

var SymKey = function (keyRealID) {
	var Key = require("./Key");

	var key = new Key(keyRealID);
	var theKey = this;

	/** getter for keyRealID */
	this.getRealID = key.getRealID;

	this.getOwner = key.getOwner;

	this.getDecryptors = key.getDecryptors;

	this.addDecryptor = key.addDecryptor;

	this.addDecryptors = key.addDecryptors;

	this.addEncryptor = key.addEncryptor;

	this.addAccess = key.addAccess;

	this.hasAccess = key.hasAccess;

	this.acessCount = key.accessCount;
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

		this.ne();
	}, cb);
};

/** get all decryptors for a certain key id */
SymKey.get = function getF(keyRealID, cb) {
	step(function () {
			if (!h.isRealID(keyRealID)) {
				throw new InvalidRealID();
			}

			client.get("key:" + keyRealID, this);
	}, h.sF(function (keyData) {
		if (keyData === "symkey") {
			this.ne(new SymKey(keyRealID));
		} else {
			throw new NotASymKey();
		}
	}), cb);
};

/** create a symmetric key */
SymKey.create = function (view, data, cb) {
	var keyRealID;
	step(function () {
		SymKey.validate(data, this);
	}, h.sF(function () {
		keyRealID = data.realid;

		client.setnx("key:" + keyRealID, "symkey", this);
	}), h.sF(function (set) {
		if (set === 0) {
			throw new RealIDInUse();
		}

		client.set("key:" + keyRealID + ":owner", view.getUserID(), this.parallel());
	}), h.sF(function () {
		this.ne(new SymKey(keyRealID));
	}), cb);
};

module.exports = SymKey;