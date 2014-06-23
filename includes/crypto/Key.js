"use strict";

//TO-DO rewrite for hset/hgetall/hget

var step = require("step");
var client = require("../redisClient");
var h = require("whispeerHelper");
var Decryptor = require("./decryptor");
var util = require("util");

var Key = function () {};

Key.prototype._getAttribute = function(attr, cb) {
	var theKey = this;
	step(function () {
		client.get(theKey._domain + attr, this);
	}, cb);
};

Key.prototype.addFasterDecryptor = function addFasterDecryptorF(request, decryptor, cb) {
	var theKey = this;
	step(function () {
		console.log(theKey.getRealID());
		theKey.getDecryptors(request, this);
	}, h.sF(function (decryptors) {
		var j;
		for (j = 0; j < decryptors.length; j += 1) {
			decryptors[j].getType(this.parallel());
		}
	}), h.sF(function (types) {
		if (types.length === 0) {
			this.last.ne(false);
		}

		var i;
		for (i = 0; i < types.length; i += 1) {
			if (types[i] !== "cryptKey") {
				this.last.ne(false);
				return;
			}
		}

		theKey.addDecryptor(request, decryptor, this);
	}), cb);
};

Key.prototype.getBasicData = function getBasicDataF(request, cb, wDecryptors) {
	var theKey = this;
	var result = {};
	step(function () {
		this.parallel.unflatten();
		result.realid = theKey.getRealID();

		theKey.hasAccess(request, this.parallel());
		theKey.getType(this.parallel());
	}, h.sF(function getBD2(access, type) {
		result.type = type;

		this.parallel.unflatten();

		if (access) {
			theKey.accessCount(this.parallel());

			if (wDecryptors) {
				theKey.getDecryptorsJSON(request, this.parallel());
			}
		} else {
			this.last.ne(result);
		}
	}), h.sF(function (accessCount, decryptors) {
		result.accessCount = accessCount;

		if (wDecryptors) {
			result.decryptors = decryptors;
		}

		this.ne(result);
	}), cb);
};

/** getter for this._realid */
Key.prototype.getRealID = function getRealIDF() {
	return this._realid;
};

/** get the owner of this key */
Key.prototype.getOwner = function getOwnerF(cb) {
	this._getAttribute(":owner", cb);
};

Key.prototype.getType = function getTypeF(cb) {
	this._getAttribute(":type", cb);
};

Key.prototype.getAllAccessedParents = function getAllAccessedParentsF(request, cb, maxdepth) {
	var theKey = this;
	var theKeys = [];
	step(function () {
		if (maxdepth === 0) {
			this.last.ne();
		} else {
			theKey.getUserDecryptors(request, this);
		}
	}, h.sF(function (keys) {
		if (keys) {
			theKeys = keys;
			var i;
			for (i = 0; i < keys.length; i += 1) {
				keys[i].getAllAccessedParents(request, this.parallel(), maxdepth-1);
			}

			this.parallel()();
		} else {
			this.last.ne(theKeys);
		}
	}), h.sF(function (parents) {
		if (parents) {
			var i;
			for (i = 0; i < parents.length; i += 1) {
				theKeys = theKeys.concat(parents[i]);
			}
		}

		this.ne(theKeys);
	}), cb);
};

Key.prototype.getUserDecryptors = function getUserDecryptorsF(request, cb) {
	var theKey = this;
	step(function () {
		Decryptor.getAllWithAccess(request, theKey._realid, this);
	}, h.sF(function (decryptors) {
		var i;
		for (i = 0; i < decryptors.length; i += 1) {
			decryptors[i].getDecryptorKey(this.parallel());
		}
		this.parallel()();
	}), h.sF(function (keys) {
		var i, result = [];

		if (keys) {
			for (i = 0; i < keys.length; i += 1) {
				if (keys[i] && typeof keys[i] === "object") {
					result.push(keys[i]);
				}
			}
		}

		this.last.ne(result);
	}), cb);
};

/** get this keys decryptors */
Key.prototype.getDecryptors = function getDecryptorsF(request, cb) {
	Decryptor.getAllWithAccess(request, this._realid, cb);
};

Key.prototype.getDecryptorsJSON = function getDecryptorsJSONF(request, cb) {
	var theKey = this;
	step(function () {
		theKey.getDecryptors(request, this);
	}, h.sF(function (decryptors) {
		var i;
		for (i = 0; i < decryptors.length; i += 1) {
			decryptors[i].getJSON(this.parallel());
		}

		if (decryptors.length === 0) {
			console.error("no decryptors for a key!");
			this.last.ne();
		}
	}), h.sF(function (result) {
		this.ne(result);
	}), cb);
};

/** add one decryptor
* @param request request
* @param data decryptor data
*/
Key.prototype.addDecryptor = function addDecryptorF(request, data, cb) {
	var theKey = this;
	step(function () {
		if (data[theKey.getRealID()]) {
			data = data[theKey.getRealID()];
		}

		if (util.isArray(data)) {
			if (data.length === 1) {
				data = data[0];
			} else {
				throw new InvalidDecryptor("multiple to add");
			}
		}

		Decryptor.create(request, theKey, data, this);
	}, cb);
};

/** add decryptors
* @param request request
* @param data decryptor data
*/
Key.prototype.addDecryptors = function addDecryptorF(request, data, cb) {
	var theKey = this;
	step(function () {
		if (data[theKey.getRealID()]) {
			data = data[theKey.getRealID()];
		}

		var i;
		for (i = 0; i < data.length; i += 1) {
			Decryptor.create(request, theKey, data[i], this.parallel());
		}
	}, cb);
};

/** add a key which is encrypted by this key
* @param realid encrypted keys real id
* @param cb callback
*/
Key.prototype.addEncryptor = function addEncryptorF(realid, cb) {
	var theKey = this;
	step(function () {
		client.sadd(theKey._domain + ":encryptors", realid, this);
	}, cb);
};

/** get the keys that are encrypted by this key
* @param cb callback
*/
Key.prototype.getEncryptors = function getEncryptorsF(cb) {
	var theKey = this;
	step(function () {
		client.smembers(theKey._domain + ":encryptors", this);
	}, h.sF(function (encrs) {
		var KeyApi = require("./KeyApi");
		if (encrs.length > 0) {
			KeyApi.getKeys(encrs, this);
		} else {
			this.ne([]);
		}
	}), cb);
};

Key.prototype.getDecryptorForRealID = function getDecryptorForRealIDF(keyRealID, cb) {
	var theKey = this;
	step(function () {
		client.get(theKey._domain + ":decryptor:map:" + keyRealID, this);
	}, cb);

};

Key.prototype.addAccessByRealID = function addAccessByRealIDF(keyRealID, userids, cb, added) {
	var theKey = this;
	step(function () {
		theKey.getDecryptorForRealID(keyRealID, this);
	}, h.sF(function (decryptorid) {
		theKey.addAccess(decryptorid, userids, this, added);
	}), cb);
};

/** add access for users to this key
* @param decryptorid decryptor who gives access
* @param userids users to give access
* @param cb callback
* @param added helper for keys already added. prevents loops
*/
Key.prototype.addAccess = function addAccessF(decryptorid, userids, cb, added) {
	var theKey = this;
	step(function () {
		var i, internal = [];
		if (!added) {
			added = [];
		} else {
			for (i = 0; i < added.length; i += 1) {
				internal.push(added[i]);
			}

			added = internal;
		}

		if (userids.length === 0) {
			this.last.ne();
			return;
		}

		if (added.indexOf(theKey._realid) > -1) {
			console.log("loop!");
			this.last.ne();
		} else {
			for (i = 0; i < userids.length; i += 1) {
				client.sadd(theKey._domain + ":access", userids[i], this.parallel());
				client.sadd(theKey._domain + ":accessVia:" + userids[i], decryptorid, this.parallel());
			}

			added.push(theKey._realid);
		}
	}, h.sF(function () {
		theKey.getEncryptors(this);
	}), h.sF(function (encryptors) {
		var i;
		if (encryptors.length > 0) {
			for (i = 0; i < encryptors.length; i += 1) {
				//TODO bugfix this!
				encryptors[i].addAccessByRealID(theKey._realid, userids, this.parallel(), added);
			}
		} else {
			this.last.ne();
		}
	}), cb);
};

Key.prototype.hasUserAccess = function hasUserAccessF(userid, cb) {
	var theKey = this;
	step(function hasAccess1() {
		client.sismember(theKey._domain + ":access", userid, this);
	}, h.sF(function hasAccess2(access) {
		if (access === 1) {
			this.last.ne(true);
		} else {
			theKey.getOwner(this);
		}
	}), h.sF(function hasAccess3(owner) {
		if (parseInt(owner, 10) === parseInt(userid, 10)) {
			this.last.ne(true);
		} else {
			this.ne(false);
		}
	}), cb);
};

/** checks if the current user has access to this key
* @param request users request
* @param cb callback
*/
Key.prototype.hasAccess = function hasAccessF(request, cb) {
	var theKey = this;
	step(function hasAccess1() {
		client.sismember(theKey._domain + ":access", request.session.getUserID(), this);
	}, h.sF(function hasAccess2(access) {
		if (access === 1) {
			this.last.ne(true);
		} else {
			theKey.getOwner(this);
		}
	}), h.sF(function hasAccess3(owner) {
		if (parseInt(owner, 10) === parseInt(request.session.getUserID(), 10)) {
			this.last.ne(true);
		} else {
			this.ne(false);
		}
	}), cb);
};

/** get the users who have access to this key */
Key.prototype.getAccess = function getAccessF(cb) {
	var theKey = this;
	step(function hasAccess1() {
		client.smembers(theKey._domain + ":access", this);
	}, h.sF(function hasAccess2(members) {
		this.last.ne(members);
	}), cb);
};

/** count how many users have access to this key */
Key.prototype.accessCount = function accessCountF(cb) {
	var theKey = this;
	step(function accessCount1() {
		client.scard(theKey._domain + ":access", this);
	}, cb);
};

module.exports = Key;