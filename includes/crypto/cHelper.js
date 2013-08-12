"use strict";

var sjcl = require("./sjcl");

var h = require("whispeerHelper");

var chelper;

function objInternalHash(val) {
	if (typeof val === "object") {
		return object2Hash(val);
	} else if (typeof val === "function") {
		throw "can not hash objects with functions";
	} else if (typeof val === "undefined") {
		throw "can not hash undefined value";
	} else {
		return val.toString();
	}
}

/** hash an object. */
function object2Hash(obj, arr) {
	var val, hashObj;

	if (obj instanceof Array) {
		hashObj = [];
		var i;
		for (i = 0; i < obj.length; i += 1) {
			hashObj.push(objInternalHash(obj[i]));
		}

		hashObj.sort();
	} else {
		hashObj = {};
		for (val in obj) {
			if (obj.hasOwnProperty(val)) {
				hashObj[val] = objInternalHash(obj[val]);
			}
		}

	}

	var sortation = Object.keys(hashObj).sort();
	var json = JSON.stringify(hashObj, sortation);

	if (!arr) {
		return "hash:" + chelper.bits2hex(sjcl.hash.sha256.hash(json));
	}

	return sjcl.hash.sha256.hash(json);
}

chelper = {
	hash: {
		hash: function (text) {
			return chelper.bits2hex(sjcl.hash.sha256.hash(text));
		},

		hashPW: function (pw) {
			return chelper.bits2hex(sjcl.hash.sha256.hash(pw)).substr(0, 10);
		},

		hashObject: function (obj) {
			return chelper.bits2hex(object2Hash(obj, true));
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