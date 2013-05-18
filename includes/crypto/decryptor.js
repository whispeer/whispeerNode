var step = require("step");
var client = require("../client");
var h = require("../helper");

require("../errors");

"use strict";

var Decryptor = function (keyRealID, counter) {
	/** getter for keyRealID */
	this.getRealID = function getRealIDF() {
		return keyRealID;
	};

	/** getter for counter attribute */
	this.getCounter = function getCounterIDF() {
		return counter;
	};

	var type, secret, decryptorID, theDecryptor = this;

	/** get the type of this decryptor */
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

	/** get the secret */
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

	/** get this decryptors key id */
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

	/** get the json data for this decryptor */
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
				};
			} else {
				jsonData = {
					secret: result[0],
					decryptortype: result[2]
				};
			}

			this.ne(jsonData);
		}), cb);
	};

	/** delete this decryptor */
	this.del = function delF(cb) {
		step(function () {
			client.sdel("key:" + keyRealID + ":decryptorSet", counter, this.parallel());
			client.del("key:" + keyRealID + ":decryptor:" + counter + ":secret", this.parallel());
			client.del("key:" + keyRealID + ":decryptor:" + counter + ":type", this.parallel());
			client.del("key:" + keyRealID + ":decryptor:" + counter + ":decryptorid", this.parallel());
		}, h.sF(function () {
			//do not pass out results.
			this.ne();
		}), cb);
	};
};

/** get all decryptors for a certain key id */
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

/** create a decryptor */
Decryptor.create = function (keyRealID, data, cb) {
	//TODO: check keyRealID for correctness
	var counter;
	step(function () {
		if (!data || !data.secret || !data.type) {
			throw new InvalidDecryptor("secret or type missing");
		}

		if (data.type !== "password" && !data.decryptorid) {
			throw new InvalidDecryptor("not password based but no key id given");
		}

		//TODO: make type checks for the given data.

		client.incr("key:" + keyRealID + ":decryptors", this);
	}, h.sF(function (id) {
		counter = id;
		client.set("key:" + keyRealID + ":decryptor:" + counter + ":secret", data.secret, this.parallel());
		client.set("key:" + keyRealID + ":decryptor:" + counter + ":type", data.type, this.parallel());
		if (data.decryptorid) {
			client.set("key:" + keyRealID + ":decryptor:" + counter + ":decryptorid", data.decryptorid, this.parallel());
		}
	}), h.sF(function () {
		client.sadd("key:" + keyRealID + ":decryptorSet", counter, this);
	}), h.sF(function (success) {
		if (success === 0) {
			console.err("decryptor already existing:" + counter + "-" + keyRealID);
		}

		this.ne(new Decryptor(keyRealID, counter));
	}), cb);
};