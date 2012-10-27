"use strict";
if (typeof (ssn) === "undefined") {
	var ssn = {};
}

var step = require("Step");
var sjcl = require("./crypto/sjcl.js");

/** contains general helper functions */
ssn.helper = {
	/** chars for a sid */
	codeChars: ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Y", "X", "C", "V", "B", "N", "M", "q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l", "y", "x", "c", "v", "b", "n", "m", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
	/** get a random sid of given length 
	* @param length length of sid
	* @param callback callback
	* @callback (error, sid)
	*/
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
	/** just a function which moves on in step */
	passFunction: function () {
		this.apply(null, arguments);
	},
	/** order a certain ass-array correctly
	* @param object object to sort
	* @param order correct order (normal array)
	* @param getFunction which func to call on objects to get their "value"
	* @return ordered object
	*/
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
	/** decode an EncryptedSignedMessage */
	decodeESM: function (esm) {
		var result = {};
		result.m = this.base64ToHex(esm.m);
		result.s = this.base64ToHex(esm.s);
		result.iv = this.base64ToHex(esm.iv);

		return result;
	},
	/** convert a hex value to a base64 value
	* @param val hex value
	* @return base64 value
	*/
	hexToBase64: function (val) {
		return sjcl.codec.base64.fromBits(sjcl.codec.hex.toBits(val));
	},
	/** convert a base64 value to a hex value
	* @param val base64 value
	* @return hex value
	*/
	base64ToHex: function (val) {
		return sjcl.codec.hex.fromBits(sjcl.codec.base64.toBits(val));
	},

	/** is data an integer?
	* @param data value to check for int value
	* @return bool is integer?
	*/
	isInt: function (data) {
		var y = parseInt(data, 10);
		if (isNaN(y)) {
			return false;
		}
		return y.toString() === data.toString();
	},

	/** is data an id?*/
	isID: function (data) {
		return ssn.helper.isInt(data);
	},

	/** is data a valid nickname? */
	isNickname: function (data) {
		return this.isset(data) && data.match(/^[A-z][A-z0-9]*$/);
	},

	/** is data an e-mail? */
	isMail: function (data) {
		return this.isset(data) && data.match(/^[A-Z0-9._%\-]+@[A-Z0-9.\-]+\.[A-Z]+$/i);
	},

	/** is data a session Key (hex value with certain length) */
	isSessionKey: function (data) {
		return (data.match(/^[A-z0-9]$/) && (data.length === 64 || data.length === 32));
	},

	/** typeof val == object? */
	isObject: function (val) {
		return (typeof val === "object");
	},

	/** is val set (not null/undefined) */
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

	/** is needle in haystack? */
	inArray: function (haystack, needle) {
		var i = 0;
		for (i = 0; i < haystack.length; i += 1) {
			if (haystack[i] === needle) {
				return true;
			}
		}

		return false;
	},

	/** checks if certain values in an array are set.
	* @param arrayName array to check
	* @param ... vals to check
	* @return true if arrayName[val1][val2]...[valx] are all set.
	*/
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