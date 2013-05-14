var step = require("step");
var client = require("../client");
var h = require("../helper");

require("../errors");

"use strict";

var Decryptor = function (keyRealID, counter) {
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	this.getCounter = function getCounterIDF() {
		return counter;
	};

	var type, secret, decryptorID, theDecryptor = this;

	this.getType = function getTypeF(cb) {
		step(function () {
			if (type) {
				this.last.ne(type);
			} else {
				client.get("key:" + keyRealID + ":decryptor:" + counter + ":type", this);
			}
		}, h.sF(function (theType) {
			if (!theType) {
				throw new LostDecryptor();
			}

			type = theType;

			this.last.ne(type);
		}), cb);
	};

	this.getSecret = function getSecretF(cb) {
		step(function () {
			if (secret) {
				this.last.ne(secret);
			} else {
				client.get("key:" + keyRealID + ":decryptor:" + counter + ":secret", this);
			}
		}, h.sF(function (theSecret) {
			if (!theSecret) {
				throw new LostDecryptor();
			}

			secret = theSecret;

			this.last.ne(secret);
		}), cb);
	};

	this.getDecryptorID = function getDecryptorIDF(cb) {
		step(function () {
			if (decryptorID) {
				this.last.ne(decryptorID);
			} else {
				client.get("key:" + keyRealID + ":decryptor:" + counter + ":decryptorid", this);
			}
		}, h.sF(function (theDecryptorID) {
			if (!theDecryptorID) {
				throw new LostDecryptor();
			}

			decryptorID = theDecryptorID;

			this.last.ne(decryptorID);
		}), cb);
	};

	this.getJSON = function getJSONF(cb) {
		step(function getDecryptorData() {			
			theDecryptor.getSecret(this.parallel());
			theDecryptor.getDecryptorID(this.parallel());
			theDecryptor.getType(this.parallel());
		}, h.sF(function theDecryptorData(result) {
			var jsonData;
			if (result[1]) {
				jsonData = {
					secret: result[0],
					decryptorid: result[1],
					decryptortype: result[2]
				}
			} else {
				jsonData = {
					secret: result[0],
					decryptortype: result[2]
				}			
			}

			this.ne(jsonData);
		})
	};

	this.del = function delF(cb) {
	
	};
};

Decryptor.getAll = function getAllF(keyRealID, cb) {
	//TODO check keyRealID is a valid keyRealID!
	step(function () {
		client.smembers("key:" + keyRealID + ":decryptorSet", this);
	}, h.sF(function (decryptorSet) {
		var results = [];

		var i;
		for (i = 0; i < decryptorSet.length; i += 1) {
			results.push(new Decryptor(keyRealID, decryptorSet[i]));
		}

		this.ne(results);
	}), cb);
};

Decryptor.create = function (keyRealID, data) {

};