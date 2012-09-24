"use strict";
if (typeof (ssn) === "undefined") {
	var ssn = {};
}

var step = require("Step");
var sjcl = require("./crypto/sjcl.js");

ssn.helper = {
	codeChars: ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Y", "X", "C", "V", "B", "N", "M", "q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l", "y", "x", "c", "v", "b", "n", "m", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
	code: function (length, callback) {
		var random = require('secure_random');

		step(function generateRandom() {
			var i = 0;
			for (i = 0; i < length; i += 1) {
				random.getRandomInt(0, ssn.helper.codeChars.length - 1, this.parallel());
			}

			return;
		}, function (err, numbers) {
			if (err) {
				callback(err);
			}

			var result = "", i = 0;

			for (i = 0; i < numbers.length; i += 1) {
				result = result + ssn.helper.codeChars[numbers[i]];
			}

			callback(null, result);
		});
	},
	passFunction: function () {
		this.apply(null, arguments);
	},
	orderCorrectly: function (object, order, getFunction) {
		var i, j, results = [];
		for (i = 0; i < order.length; i += 1) {
			for (j = 0; j < object.length; j += 1) {
				if (object[j][getFunction]() === order[i]) {
					results.push(object[j]);

					object.splice(j, 1);

					break;
				}
			}
		}

		return results;
	},
	decodeESM: function (esm) {
		var result = {};
		result.m = this.base64ToHex(esm.m);
		result.s = this.base64ToHex(esm.s);
		result.iv = this.base64ToHex(esm.iv);

		return result;
	},
	hexToBase64: function (val) {
		return sjcl.codec.base64.fromBits(sjcl.codec.hex.toBits(val));
	},
	base64ToHex: function (val) {
		return sjcl.codec.hex.fromBits(sjcl.codec.base64.toBits(val));
	},
	isInt: function (data) {
		var y = parseInt(data, 10);
		if (isNaN(y)) {
			return false;
		}
		return y.toString() === data.toString();
	},

	isID: function (data) {
		return ssn.helper.isInt(data);
	},

	isNickname: function (data) {
		return this.isset(data) && data.match(/^[A-z][A-z0-9]*$/);
	},

	isMail: function (data) {
		return this.isset(data) && data.match(/^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i);
	},

	isSessionKey: function (data) {
		return (data.match(/^[A-z0-9]$/) && (data.length === 64 || data.length === 32));
	},

	isObject: function (val) {
		return (typeof val === "object");
	},

	isset: function (val) {
		return (typeof val !== "undefined" && val !== null);
	},

	/** step function
	* throws given errors
	* passes on all other stuff to given function
	*/
	sF: function (cb) {
		return function (err) {
			if (err) {
				console.log(err);
				console.trace();
				throw err;
			}

			var args = []; // empty array
			var i = 1;
			// copy all other arguments we want to "pass through"
			for (i = 1; i < arguments.length; i += 1) {
				args.push(arguments[i]);
			}

			cb.apply(this, args);
		};
	},

	inArray: function (haystack, needle) {
		var i = 0;
		for (i = 0; i < haystack.length; i += 1) {
			if (haystack[i] === needle) {
				return true;
			}
		}

		return false;
	},

	arraySet: function (arrayName) {
		var i = 1;
		var memory;
		if (ssn.helper.isset(arrayName)) {
			memory = arrayName;
		} else {
			return false;
		}

		for (i = 1; i < arguments.length; i += 1) {
			if (ssn.helper.isset(memory[arguments[i]])) {
				memory = memory[arguments[i]];
			} else {
				return false;
			}
		}

		return true;
	}
};

exports.helper = ssn.helper;