/* global require */

"use strict";

var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

require("../errors");

var SymKey = require("./symKey"),
	EccKey = require("./eccKey");

var Key = function (keyRealID) {
	var theKey = this;
	var domain = "key:" + keyRealID;

	if (!h.isRealID(keyRealID)) {
		throw new InvalidRealID();
	}

	function getAttribute(attr, cb) {
		step(function () {
			client.get(domain + attr, this);
		}, cb);
	}

	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	this.getOwner = function getOwnerF(cb) {
		getAttribute(":owner", cb);
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

	this.addEncryptor = function addEncryptorF(realid, cb) {
		step(function () {
			client.sadd(domain + ":encryptors", realid, this);
		}, cb);
	};

	this.addAccess = function addAccessF(view, decryptorid, userid, cb) {
		step(function () {
			client.sadd(domain + ":access", userid, this.parallel());
			client.sadd(domain + ":accessVia:" + userid, decryptorid, this.parallel());
		}, cb);
	};

	this.hasAccess = function hasAccessF(view, cb) {
		step(function () {
			client.sismember(domain + ":access", view.getUserID(), this);
		}, h.sF(function (access) {
			if (access === 1) {
				this.last.ne(true);
			} else {
				theKey.getOwner(this);
			}
		}), h.sF(function (owner) {
			if (owner === view.getUserID()) {
				this.last.ne(true);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	this.acessCount = function accessCountF(cb) {
		step(function () {
			client.scard(domain + ":access", this);
		}, cb);
	};
};

Key.get = function getKF(realid, callback) {
	step(function () {
		client.get("key:" + realid, this);
	}, h.sF(function (type) {
		switch (type) {
		case "symkey":
			this.last.ne(new SymKey(realid));
			break;
		case "ecckey":
			this.last.ne(new EccKey(realid));
			break;
		default:
			this.last.ne(false);
			break;
		}
	}), callback);
};

Key.getKeys = function getKeysF(realids, callback) {
	step(function () {
		var i;
		for (i = 0; i < realids.length; i += 1) {
			Key.get(realids[i], this.parallel());
		}
	}, callback);
};

module.exports = Key;