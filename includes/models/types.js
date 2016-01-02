"use strict";

var h = require("whispeerHelper");

module.exports = {
	hex: function (val) {
		return h.isHex(val);
	},
	integerArray: function (arr) {
		return arr.reduce(function (prev, cur) {
			return prev && cur === +cur && cur === (cur|0);
		}, true);
	},
	keyID: function (val) {
		return h.isRealID(val);
	}
};
