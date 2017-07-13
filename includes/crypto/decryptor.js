"use strict";

var client = require("../redisClient");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var Decryptor = function (keyRealID, count) {
	var domain = "key:" + keyRealID + ":decryptor:" + count;

	function getAttribute(attr) {
		return client.hgetAsync(domain, attr);
	}

	/** getter for counter attribute */
	this.getID = function getIDF() {
		return count;
	};

	this.getDecryptorID = function getRealIDF(cb) {
		return getAttribute("decryptorid").nodeify(cb);
	};

	this.getDecryptorKey = function getDecryptorKeyF(cb) {
		return getAttribute("decryptorid").then(function (decryptorid) {
			if (decryptorid) {
				var KeyApi = require("./KeyApi");
				return KeyApi.get(decryptorid);
			}
		}).nodeify(cb)
	};

	/** get the type of this decryptor */
	this.getType = function getTypeF(cb) {
		return getAttribute("type").nodeify(cb)
	};

	/** get the json data for this decryptor */
	this.getJSON = function (cb) {
		return client.hgetallAsync(domain).nodeify(cb)
	};

	/** remove this decryptors data */
	this.removeData = function (m, cb) {
		return client.hgetAsync("key:" + keyRealID + ":decryptor:" + count, "decryptorid").then(function (decryptorid) {
			m.srem("key:" + keyRealID + ":decryptor:decryptorSet", count);
			m.del(domain);

			if (decryptorid) {
				m.hdel("key:" + keyRealID + ":decryptor:map", decryptorid);
			}
		}).nodeify(cb)
	};
};

Decryptor.getAllWithAccess = function (request, keyRealID, cb) {
	return request.session.logedinError().then(function () {
		if (!h.isRealID(keyRealID)) {
			throw new InvalidRealID();
		}

		return client.smembersAsync("key:" + keyRealID + ":accessVia:" + request.session.getUserID());
	}).map((decryptorID) => {
		return new Decryptor(keyRealID, decryptorID);
	}).nodeify(cb)
};

/** get all decryptors for a certain key id */
Decryptor.getAll = function getAllF(keyRealID, cb) {
	return Bluebird.try(function () {
		if (!h.isRealID(keyRealID)) {
			throw new InvalidRealID();
		}

		return client.smembersAsync("key:" + keyRealID + ":decryptor:decryptorSet");
	}).then(function (decryptorSet) {
		return decryptorSet.map(function (count) {
			return new Decryptor(keyRealID, count);
		});
	}).nodeify(cb)
};

Decryptor.validateFormat = function validateFormat(data) {
	//data needs to be existing and ct needs to be hex
	if (!data || !h.isHex(data.ct)) {
		throw new InvalidDecryptor("data or secret missing");
	}

	//if not pw we need a realid.
	if (data.type !== "pw" && (!data.decryptorid || !h.isRealID(data.decryptorid))) {
		throw new InvalidDecryptor("key id missing");
	}

	// if pw or symkey, we need a hex iv
	if ((data.type === "pw" || data.type === "symKey" || data.type === "backup") && !h.isHex(data.iv)) {
		throw new InvalidDecryptor("invalid iv");
	}

	//if pw we need a hex salt
	if (data.type === "pw" && !h.isHex(data.salt)) {
		throw new InvalidDecryptor("invalid salt");
	}

	if (["symKey", "cryptKey", "pw", "backup"].indexOf(data.type) === -1) {
		throw new InvalidDecryptor("invalid type.");
	}
};

Decryptor.validateNoThrow = function (request, data, key) {
	return Decryptor.validate(request, data, key).then(() => true).catch(() => false)
};

Decryptor.validate = function validateF(request, data, key, cb) {
	var keyRealID = key.getRealID();
	var parentKey;
	return Bluebird.try(function () {
		Decryptor.validateFormat(data);

		return key.hasAccess(request);
	}).then(function (keyAcc) {
		if (!keyAcc) {
			throw new AccessViolation(`No Key Access here! (${keyRealID})`);
		}

		//find dat key
		if (data.type === "symKey") {
			var SymKey = require("./symKey.js")
			return SymKey.get(data.decryptorid)
		} else if (data.type === "cryptKey") {
			var EccKey = require("./eccKey.js")
			return EccKey.get(data.decryptorid)
		} else if (data.type === "pw" || data.type === "backup") {
			return true
		}

		throw new InvalidDecryptor("invalid type.");
	}).then(function (k) {
		parentKey = k;
		if (!parentKey) {
			throw new InvalidDecryptor("key not found.");
		}

		if (typeof parentKey === "object") {
			return Bluebird.all([
				parentKey.hasAccess(request),
				parentKey.getType(),
			])
		}

		return Bluebird.resolve([true])
	}).spread((parentAcc, parentType) => {
		if (!parentAcc && parentType !== "crypt") {
			throw new AccessViolation("No Access here! " + parentAcc + "(" + keyRealID + " - " + (parentKey.getRealID ? parentKey.getRealID() : "") + ")");
		}

		//is there already a key like this one?
		return client.hgetAsync("key:" + keyRealID + ":decryptor:map", data.decryptorid);
	}).then(function (val) {
		if (val !== null) {
			throw new InvalidDecryptor("already existing");
		}

		return parentKey
	}).nodeify(cb);
};

/** create a decryptor */
Decryptor.create = function (request, key, data, cb) {
	var decryptorInternalID, keyRealID = key.getRealID(), parentKey;

	//only allow key creation when logged in
	return request.session.logedinError().then(() => {
		//validate our decryptor
		return Decryptor.validate(request, data, key);
	}).then((p) => {
		parentKey = p;

		return client.incrAsync("key:" + keyRealID + ":decryptor:count");
	}).then((count) => {
		decryptorInternalID = count;

		var domain = "key:" + keyRealID + ":decryptor:" + count;

		var toSet = {
			ct: data.ct,
			type: data.type,
			creator: request.session.getUserID()
		};

		//set decryptorid if applicable
		if (data.decryptorid) {
			toSet.decryptorid = data.decryptorid;
		}

		//set iv if applicable
		if (data.iv) {
			toSet.iv = data.iv;
		}

		//set salt if applicable
		if (data.salt) {
			toSet.salt = data.salt;
		}

		const hashSetDecryptorData = client.hmsetAsync(domain, toSet);

		//add to list. we need this to grab all decryptors.
		const addDecryptorToList = client.saddAsync(`key:${keyRealID}:decryptor:decryptorSet`, decryptorInternalID);

		const addDecryptorToMap = data.type !== "pw" ? client.hsetAsync(`key:${keyRealID}:decryptor:map`, data.decryptorid, count) : null

		return Bluebird.all([
			hashSetDecryptorData,
			addDecryptorToList,
			addDecryptorToMap
		])
	}).then(() => {
		if (data.type === "pw" || data.type === "backup") {
			return [request.session.getUserID()];
		} else {
			return parentKey.getAccess();
		}
	}).then(function (access) {

		const addEncryptor = typeof parentKey === "object" ? parentKey.addEncryptor(keyRealID) : null

		const addKeyAccess = key.addAccess(decryptorInternalID, access)

		return Bluebird.all([
			addKeyAccess,
			addEncryptor,
		])
	}).then(function () {
		return new Decryptor(keyRealID, data.decryptorid)
	}).nodeify(cb);
};

module.exports = Decryptor;
