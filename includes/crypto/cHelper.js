"use strict";

var sjcl = require("./sjcl");

var h = require("whispeerHelper");

var chelper;


var objectHasher = function (data, keepDepth, verifyTree) {
	this._data = data;
	this._depth = keepDepth;
	this._verifyTree = verifyTree;
	this._hashedObject = {};
};

objectHasher.prototype.verifyHashStructure = function () {
	this._verifyTree = true;

	this.verifyAllAttributesAreHashes(this._data);

	this.hash();
};

objectHasher.prototype.sjclHash = function (data) {
	return "hash::" + chelper.bits2hex(sjcl.hash.sha256.hash(data));
};

objectHasher.prototype.getHashObject = function () {
	return this._hashedObject;
};

objectHasher.prototype._hashProperty = function (val) {
	return (this._verifyTree ? val : this.sjclHash("data::" + val.toString()));
};

objectHasher.prototype._doHashNewObject = function (val, attr) {
	var hasher = new objectHasher(val, this._depth-1, this._verifyTree);
	var result = hasher.hash();
	if (this._depth > 0) {
		this._hashedObject[attr] = hasher.getHashObject();
	}

	return result;
};

objectHasher.prototype._doHash = function (val, attr) {
	var allowedTypes = ["number", "string", "boolean"];

	if (attr === "hash") {
		if (!this._verifyTree) {
			throw "object can not have hash attributes";
		}

		return;
	}

	var type = typeof val, result;
	if (type === "object") {
		result = this._doHashNewObject(val, attr);
	} else if (allowedTypes.indexOf(type) > -1) {
		result = this._hashProperty(val);
	} else {
		throw "can not hash objects with " + type;
	}

	if (!this._hashedObject[attr]) {
		this._hashedObject[attr] = result;
	}

	return result;
};

objectHasher.prototype._hashArray = function () {
	var i, result = [];
	for (i = 0; i < this._data.length; i += 1) {
		result.push(this._doHash(this._data[i]), i);
	}

	return this.sjclHash(JSON.stringify(result));
};

objectHasher.prototype._jsonifyUnique = function (obj) {
	var sortation = Object.keys(obj).sort();
	return JSON.stringify(obj, sortation);
};

objectHasher.prototype._hashObject = function () {
	var attr, hashObj = {};
	for (attr in this._data) {
		if (this._data.hasOwnProperty(attr)) {
			hashObj[attr] = this._doHash(this._data[attr], attr);
		}
	}

	return this.sjclHash(this._jsonifyUnique(hashObj));
};

objectHasher.prototype._hashData = function () {
	if (this._data instanceof Array) {
		return this._hashArray();
	} else {
		return this._hashObject();
	}
};

objectHasher.prototype.hash = function() {
	if (typeof this._data !== "object") {
		throw "this is not an object!";
	}

	var result = this._hashData();

	if (this._verifyTree && result !== this._data.hash) {
		throw "verifyTree failed";
	}

	this._hashedObject.hash = result;
	return result;
};

objectHasher.prototype.hashBits = function () {
	var result = this.hash();
	return chelper.hex2bits(result.substr(6));
};

chelper = {
	hash: {
		hash: function (text) {
			return chelper.bits2hex(sjcl.hash.sha256.hash(text));
		},

		hashPW: function (pw) {
			return chelper.bits2hex(sjcl.hash.sha256.hash(pw)).substr(0, 10);
		},

		hashObject: function (obj) {
			return new objectHasher(obj).hash();
		},
	},
	getCurveName: function (curve) {
		var curcurve;
		for (curcurve in sjcl.ecc.curves) {
			if (sjcl.ecc.curves.hasOwnProperty(curcurve)) {
				if (sjcl.ecc.curves[curcurve] === curve) {
					return curcurve;
				}
			}
		}

		throw "curve not existing";
	},
	getCurve: function (curveName) {
		if (typeof curveName !== "string" || curveName.substr(0, 1) !== "c") {
			curveName = "c" + curveName;
		}

		if (sjcl.ecc.curves[curveName]) {
			return sjcl.ecc.curves[curveName];
		}

		throw "invalidCurve";
	},
	hex2bits: function (t) {
		if (t instanceof Array) {
			return t;
		}

		if (h.isHex(t)) {
			return sjcl.codec.hex.toBits(t);
		}

		//TODO
		throw new InvalidHexError();
	},
	bits2hex: function (t) {
		if (typeof t === "string") {
			return t;
		}

		return sjcl.codec.hex.fromBits(t);
	},
	sjclPacket2Object: function (data) {
		var decoded = sjcl.json.decode(data);
		var result = {
			ct: h.bits2hex(decoded.ct),
			iv: h.bits2hex(decoded.iv)
		};

		if (decoded.salt) {
			result.salt = h.bits2hex(decoded.salt);
		}

		return result;
	},
	Object2sjclPacket: function (data) {
		if (typeof data.salt === "string") {
			data.salt = h.hex2bits(data.salt);
		}

		if (typeof data.iv === "string") {
			data.iv = h.hex2bits(data.iv);
		}

		if (typeof data.ct === "string") {
			data.ct = h.hex2bits(data.ct);
		}

		return sjcl.json.encode(data);
	}
};

module.exports = chelper;