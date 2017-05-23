"use strict";

var KeyApi = {};

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");
var Bluebird = require("bluebird")

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
KeyApi.validateDecryptor = function validateDecryptorF(request, data, key, callback) {
	step(function () {
		Decryptor.validate(request, data, key, this);
	}, callback);
};

KeyApi.isKey = function isKeyF(key) {
	return key instanceof SymKey || key instanceof EccKey;
};

/** warning: side effects possible */
KeyApi.removeKeyDecryptorForUser = function (request, realid, userid, cb) {
	var key, m = client.multi();
	step(function () {
		return KeyApi.get(realid);
	}, h.sF(function (_key) {
		key = _key;
		return key.getOwner();
	}), h.sF(function (owner) {
		if (h.parseDecimal(owner) !== request.session.getUserID()) {
			throw new Error("can only remove decryptors of own keys!");
		}

		console.log("removing decryptor for user: " + userid);
		key.removeDecryptorForUser(m, userid, this);
	}), h.sF(function () {
		m.exec(this);
	}), cb);
};

/** warning: side effects possible */
KeyApi.removeKeyDecryptor = function (request, realid, decryptorid, cb) {
	var key, m = client.multi();
	step(function () {
		KeyApi.get(realid, this);
	}, h.sF(function (_key) {
		key = _key;
		return key.getOwner();
	}), h.sF(function (owner) {
		if (h.parseDecimal(owner) !== request.session.getUserID()) {
			throw new Error("can only remove decryptors of own keys!");
		}

		key.removeDecryptor(m, decryptorid, this);
	}), h.sF(function () {
		m.exec(this);
	}), cb);
};

/** warning: side effects possible */
KeyApi.removeKey = function (request, realid, cb) {
	var key, m = client.multi();
	step(function () {
		KeyApi.get(realid, this);
	}, h.sF(function (_key) {
		key = _key;
		return key.getOwner();
	}), h.sF(function (owner) {
		if (h.parseDecimal(owner) !== request.session.getUserID()) {
			throw new Error("can only remove decryptors of own keys!");
		}

		key.remove(m, this);
	}), h.sF(function () {
		m.exec(this);
	}), cb);
};

/** get a key
* @param realid keys real id
*/
KeyApi.get = function (realid, cb) {
	if (!realid) {
		throw new Error("invalid realid " + realid);
	}

	return client.hgetAsync("key:" + realid, "type").then(function (type) {
		switch (type) {
		case "sym":
			return new SymKey(realid);
		case "crypt":
		case "sign":
			return new EccKey(realid);
		default:
			throw new KeyNotFound("key not found for realid: " + realid);
		}
	}).nodeify(cb)
};

KeyApi.createWithDecryptors = function (request, keyData, cb) {
	if (keyData.type === "sign" || keyData.type === "crypt") {
		EccKey.createWDecryptors(request, keyData, cb);
	} else {
		SymKey.createWDecryptors(request, keyData, cb);
	}
};

KeyApi.getWData = function (request, realid, callback, wDecryptors) {
	step(function () {
		return KeyApi.get(realid);
	}, h.sF(function (key) {
		return key.getKData(request, wDecryptors);
	}), callback);
};

/** get multiple keys */
KeyApi.getKeys = function getKeysF(realids, cb) {
	return Bluebird.resolve(realids).map((realid) => {
		return KeyApi.get(realid);
	}).nodeify(cb)
};

KeyApi.checkKey = function (errors, realid, cb) {
	step(function () {
		KeyApi.get(realid, this);
	}, function (err, key) {
		if (err) {
			errors.push(err);
			this.ne();
		} else {
			key.check(errors, this);
		}
	}, cb);
};

module.exports = KeyApi;
