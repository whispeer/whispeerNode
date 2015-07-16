"use strict";
var step = require("step");
var h = require("whispeerHelper");

var sjcl = require("./crypto/sjcl");

function fingerPrintData(data) {
	return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(data));
}

function fingerPrintPublicKey(publicKey) {
	//should we add the type and curve here too?
	//as the curve is fixed for now it should not be a problem
	return fingerPrintData(publicKey._point.toBits());
}

function getCurve(curveName) {
	if (typeof curveName !== "string" || curveName.substr(0, 1) !== "c") {
		curveName = "c" + curveName;
	}

	if (sjcl.ecc.curves[curveName]) {
		return sjcl.ecc.curves[curveName];
	}

	throw new Error("invalidCurve");
}

/** a signature key
* @param keyData sign key data
*/
var SignKey = function (keyData) {
	var publicKey, x, y, curve, point, realid;

	if (!keyData || !keyData.point || !keyData.point.x || !keyData.point.y || !keyData.curve || !keyData.realid) {
		throw new Error("invalid sign key data");
	}

	curve = getCurve(keyData.curve);

	x =	curve.field.fromBits(sjcl.codec.hex.toBits(keyData.point.x));
	y = curve.field.fromBits(sjcl.codec.hex.toBits(keyData.point.y));
	point = new sjcl.ecc.point(curve, x, y);

	publicKey = new sjcl.ecc.ecdsa.publicKey(curve, point);

	realid = keyData.realid;

	if (fingerPrintPublicKey(publicKey) !== realid.split(":")[1]) {
		throw new Error("Fingerprint and Key id do not match");
	}

	this.getRealID = function () {
		return realid;
	};

	this.getFingerPrint = function () {
		return fingerPrintPublicKey(publicKey);
	};

	this.verify = function (signature, hash, callback) {
		step(function () {
			this.ne(publicKey.verify(hash, signature));
		}, h.sF(function (valid) {
			this.ne(valid);
		}), callback);
	};
};

var ObjectHasher = function (data) {
	this._data = data;
};

ObjectHasher.prototype.sjclHash = function (data) {
	return "hash::" + sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(data));
};

ObjectHasher.prototype._hashProperty = function (val) {
	return this.sjclHash("data::" + val.toString());
};

ObjectHasher.prototype._doHashNewObject = function (val) {
	var hasher = new ObjectHasher(val);
	return hasher.hash();
};

ObjectHasher.prototype._doHash = function (val, attr) {
	var allowedTypes = ["number", "string", "boolean"];

	if (attr === "hash") {
		throw new Error("object can not have hash attributes");
	}

	var type = typeof val, result;
	if (type === "object") {
		result = this._doHashNewObject(val, attr);
	} else if (allowedTypes.indexOf(type) > -1) {
		result = this._hashProperty(val);
	} else {
		throw new Error("can not hash objects with " + type);
	}

	return result;
};

ObjectHasher.prototype._hashArray = function () {
	var i, result = [];
	for (i = 0; i < this._data.length; i += 1) {
		result.push(this._doHash(this._data[i]), i);
	}

	return this.sjclHash(JSON.stringify(result));
};

ObjectHasher.prototype._jsonifyUnique = function (obj) {
	var sortation = Object.keys(obj).sort();
	return JSON.stringify(obj, sortation);
};

ObjectHasher.prototype._hashObject = function () {
	var attr, hashObj = {};
	for (attr in this._data) {
		if (this._data.hasOwnProperty(attr)) {
			hashObj[attr] = this._doHash(this._data[attr], attr);
		}
	}

	return this.sjclHash(this._jsonifyUnique(hashObj));
};

ObjectHasher.prototype._hashData = function () {
	if (this._data instanceof Array) {
		return this._hashArray();
	} else {
		return this._hashObject();
	}
};

ObjectHasher.prototype.hash = function() {
	if (typeof this._data !== "object") {
		throw new Error("this is not an object!");
	}

	return this._hashData();
};

ObjectHasher.prototype.hashBits = function () {
	var result = this.hash();
	return sjcl.codec.hex.toBits(result.substr(6));
};

function verifyObject(signature, object, keyData, callback) {
	step(function signO1() {
		var key = new SignKey(keyData);
		var hash = new ObjectHasher(object, 0).hashBits();

		key.verify(sjcl.codec.hex.toBits(signature), hash, this);
	}, function (e, correct) {
		if (e) {
			this.ne(false);
		} else {
			this.ne(correct);
		}
	}, callback);
}

function verifySecuredMeta(signKey, metaData, type, cb) {
	var attributesNeverVerified = ["_signature", "_hashObject"];

	step(function () {
		var metaCopy = h.deepCopyObj(metaData);

		attributesNeverVerified.forEach(function(attr) {
			delete metaCopy[attr];
		});

		if (metaCopy._type !== type) {
			throw new Error("invalid object type. is: " + metaCopy._type + " should be: " + type);
		}

		verifyObject(metaData._signature, metaCopy, signKey, this);
	}, h.sF(function (correctSignature) {
		if (!correctSignature) {
			//alert("Bug: signature did not match (" + that._original.meta._type + ") Please report this bug!");
			throw new Error("invalid signature for " + type);
		}

		this.ne(true);
	}), cb);
}

var User = require("./user");
var KeyApi = require("./crypto/KeyApi");

function verifyUserMeta(request, metaData, type, cb) {
	step(function () {
		var ownUserID = request.session.getUserID();
		User.getUser(ownUserID, this);
	}, h.sF(function (ownUser) {
		ownUser.getSignKey(request, this);
	}), h.sF(function (ownSignKey) {
		KeyApi.getWData(request, ownSignKey, this);
	}), h.sF(function (ownSignKeyObj) {
		verifySecuredMeta(ownSignKeyObj, metaData, type, this);
	}), cb);
}

verifyUserMeta.byKey = verifySecuredMeta;

module.exports = verifyUserMeta;
