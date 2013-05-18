var step = require("step");
var client = require("../client");
var h = require("../helper");

require("../errors");

"use strict";

var SymKey = function (keyRealID) {
	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
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
};

/** get all decryptors for a certain key id */
SymKey.get = function getF(keyRealID, cb) {
	//TODO check keyRealID is a valid keyRealID!
	step(function () {
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
SymKey.create = function (keyRealID, cb) {
	//TODO: check keyRealID for correctness
	step(function () {
		client.setnx("key:" + keyRealID, "symkey", this);
	}, h.sF(function (data) {
		if (data === 0) {
			throw new RealIDInUse();
		}

		this.ne(new SymKey(keyRealID));
	}), cb);
};