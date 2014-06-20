"use strict";

var KeyApi = {};

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");

var EccKey = require("./eccKey");
var SymKey = require("./symKey");
var Decryptor = require("./decryptor");

/** validate key data. Does no duplicate check. */
KeyApi.validate = function validateF(data, callback) {
	step(function () {
		if (data) {
			switch (data.type) {
			case "sym":
				SymKey.validate(data, this);
				break;
			case "sign":
			case "crypt":
				EccKey.validate(data, this);
				break;
			default:
				throw new InvalidKey();
			}
		} else {
			throw new InvalidKey();
		}
	}, callback);
};

/** validate a decryptor. No Duplicate check. */
KeyApi.validateDecryptor = function validateDecryptorF(view, data, key, callback) {
	step(function () {
		Decryptor.validate(view, data, key, this);
	}, callback);
};

KeyApi.isKey = function isKeyF(key) {
	return key instanceof SymKey || key instanceof EccKey;
};

/** get a key
* @param realid keys real id
*/
KeyApi.get = function getKF(realid, callback) {
	if (!realid) {
		throw new Error("invalid realid");
	}

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
			throw new Error("key not found for realid: " + realid);
		}
	}), callback);
};

KeyApi.createWithDecryptors = function (view, keyData, cb) {
	if (keyData.type === "sign" || keyData.type === "crypt") {
		EccKey.createWDecryptors(view, keyData, cb);
	} else {
		SymKey.createWDecryptors(view, keyData, cb);
	}
};

KeyApi.getWData = function getDataF(view, realid, callback, wDecryptors) {
	step(function () {
		KeyApi.get(realid, this);
	}, h.sF(function (key) {
		if (!key) {
			throw new Error("Key not found: " + realid);
		}
		key.getKData(view, this, wDecryptors);
	}), callback);
};

/** get multiple keys */
KeyApi.getKeys = function getKeysF(realids, callback) {
	step(function () {
		var i;
		for (i = 0; i < realids.length; i += 1) {
			KeyApi.get(realids[i], this.parallel());
		}
	}, callback);
};

module.exports = KeyApi;