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
KeyApi.validate = function (data) {
	if (data) {
		switch (data.type) {
		case "sym":
			SymKey.validate(data);
			break;
		case "sign":
		case "crypt":
			EccKey.validate(data);
			break;
		default:
			throw new InvalidKey();
		}
	} else {
		throw new InvalidKey();
	}
};

/** validate a decryptor. No Duplicate check. */
KeyApi.validateDecryptor = function (request, data, key, cb) {
	return Decryptor.validate(request, data, key).nodeify(cb);
};

KeyApi.isKey = function isKeyF(key) {
	return key instanceof SymKey || key instanceof EccKey;
};

/** warning: side effects possible */
KeyApi.removeKeyDecryptorForUser = function (request, realid, userid, cb) {
	var key, m = client.multi();

	return KeyApi.get(realid).then(function (_key) {
		key = _key;
		return key.getOwner();
	}).then(function (owner) {
		if (h.parseDecimal(owner) !== request.session.getUserID()) {
			throw new Error("can only remove decryptors of own keys!");
		}

		console.log("removing decryptor for user: " + userid);
		return key.removeDecryptorForUser(m, userid);
	}).then(function () {
		return Bluebird.fromCallback((cb) => m.exec(cb));
	}).nodeify(cb)
};

/** warning: side effects possible */
KeyApi.removeKeyDecryptor = function (request, realid, decryptorid, cb) {
	var m = client.multi();

	return KeyApi.get(realid).then((key) => {
		return key.getOwner().then((owner) => {
			if (h.parseDecimal(owner) !== request.session.getUserID()) {
				throw new Error("can only remove decryptors of own keys!");
			}
		}).thenReturn(key)
	}).then((key) => {
		return key.removeDecryptor(m, decryptorid);
	}).then(() => {
		return Bluebird.fromCallback((cb) => m.exec(cb))
	}).nodeify(cb);
};

/** warning: side effects possible */
KeyApi.removeKey = function (request, realid, cb) {
	var m = client.multi();

	return KeyApi.get(realid).then(function (key) {
		return key.getOwner().then((owner) => {
			if (h.parseDecimal(owner) !== request.session.getUserID()) {
				throw new Error("can only remove decryptors of own keys!");
			}
		}).thenReturn(key)
	}).then(function (key) {
		return key.remove(m);
	}).then(function () {
		return Bluebird.fromCallback((cb) => m.exec(cb))
	}).nodeify(cb);
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
		EccKey.create(request, keyData, cb);
	} else {
		SymKey.create(request, keyData, cb);
	}
};

KeyApi.getWData = function (request, realid, callback, wDecryptors) {
	return KeyApi.get(realid).then((key) => {
		return key.getKData(request, wDecryptors);
	}).nodeify(callback);
};

/** get multiple keys */
KeyApi.getKeys = function getKeysF(realids, cb) {
	return Bluebird.resolve(realids).map((realid) => {
		return KeyApi.get(realid);
	}).nodeify(cb)
};

KeyApi.checkKey = function (errors, realid, cb) {
	return KeyApi.get(realid).then((key) => {
		// return key.check(errors)
	}).catch((err) => {
		errors.push(err)
	}).nodeify(cb);
};

module.exports = KeyApi;
