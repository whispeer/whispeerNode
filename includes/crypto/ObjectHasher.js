"use strict";

var chelper = require("./cHelper");
var sjcl = require("./sjcl");

var ObjectHasher = function (data, version) {
	this._data = data;
	this._version = version;
};

ObjectHasher.prototype.sjclHash = function (data) {
	if (this._version > 2) {
		return data;
	}

	return "hash::" + chelper.bits2hex(sjcl.hash.sha256.hash(data));
};

ObjectHasher.prototype._hashProperty = function (val) {
	return (this._version > 1 ? val : this.sjclHash("data::" + val.toString()));
};

ObjectHasher.prototype._doHashNewObject = function (val) {
	var hasher = new ObjectHasher(val, this._version);
	return hasher.hash();
};

ObjectHasher.prototype._doHash = function (val, attr) {
	var allowedTypes = ["number", "string", "boolean"];

	if (attr === "hash") {
		throw new Error("object can not have hash attributes");
	}

	var type = typeof val;
	if (type === "object") {
		return this._doHashNewObject(val);
	}

	if (allowedTypes.indexOf(type) > -1) {
		return this._hashProperty(val);
	}
	
	throw new Error("can not hash objects with " + type);
};

ObjectHasher.prototype._stringifyArray = function () {
	var i, result = [];
	for (i = 0; i < this._data.length; i += 1) {
		result.push(this._doHash(this._data[i]), i);
	}

	return JSON.stringify(result);
};

ObjectHasher.prototype._jsonifyUnique = function (obj) {
	var sortation = Object.keys(obj).sort();
	return JSON.stringify(obj, sortation);
};

ObjectHasher.prototype._hashSubObjects = function () {
	var attr, hashObj = {};
	for (attr in this._data) {
		if (this._data.hasOwnProperty(attr)) {
			hashObj[attr] = this._doHash(this._data[attr], attr);
		}
	}

	return this._jsonifyUnique(hashObj);
};

ObjectHasher.prototype._stringifyObject = function () {
	return this._hashSubObjects();
};

ObjectHasher.prototype._stringifyObjectOrArray = function () {
	if (this._data instanceof Array) {
		return this._stringifyArray();
	} else {
		return this._stringifyObject();
	}
};

ObjectHasher.prototype.stringify = function() {
	if (typeof this._data !== "object") {
		throw new Error("this is not an object!");
	}

	return this._stringifyObjectOrArray();
};

ObjectHasher.prototype.hash = function () {
	return chelper.bits2hex(this.hashBits());
};

ObjectHasher.prototype.hashBits = function () {
	return sjcl.hash.sha256.hash(this.stringify());
};


module.exports = ObjectHasher;
