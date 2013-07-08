var step = require("step");
var client = require("../redisClient");
var h = require("../helper");

require("../errors");

"use strict";

var Key = {};

var SymKey = require("./symKey"),
	EccKey = require("./eccKey");

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