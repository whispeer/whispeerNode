"use strict";

//TO-DO rewrite for hset/hgetall/hget

var Bluebird = require("bluebird")
var client = require("../redisClient");
var h = require("whispeerHelper");
var Decryptor = require("./decryptor");
var util = require("util");

var Key = function () {};

Key.prototype._getAttribute = function(attr) {
	return client.hgetAsync(this._domain, attr)
};

Key.prototype.addFasterDecryptor = function (request, decryptor, cb) {
	console.log(this.getRealID());
	return this.getDecryptors(request).map((decryptor) => {
		decryptor.getType();
	}).then((types) => {
		if (types.length === 0) {
			return false
		}

		var i;
		for (i = 0; i < types.length; i += 1) {
			if (types[i] !== "cryptKey") {
				return false
			}
		}

		return this.addDecryptor(request, decryptor);
	}).nodeify(cb);
};

Key.prototype.getBasicData = function (request, wDecryptors) {
	const result = {};

	return Bluebird.try(() => {
		result.realid = this.getRealID();

		return Bluebird.all([
			this.hasAccess(request),
			this.getType(),
		])
	}).then(([access, type]) => {
		result.type = type;

		if (!access) {
			return Bluebird.resolve(result)
		}

		return Bluebird.all([
			this.accessCount(),
			wDecryptors ? this.getDecryptorsJSON(request) : []
		]).spread(function (accessCount, decryptors) {
			result.accessCount = accessCount;

			if (wDecryptors) {
				result.decryptors = decryptors;
			}

			return result
		})
	})
};

/** getter for this._realid */
Key.prototype.getRealID = function getRealIDF() {
	return this._realid;
};

/** get the owner of this key */
Key.prototype.getOwner = function () {
	return this._getAttribute("owner")
};

Key.prototype.getType = function (cb) {
	return this._getAttribute("type").nodeify(cb);
};

Key.prototype.getAllAccessedParents = function (request, maxdepth) {
	if (maxdepth === 0) {
		return Bluebird.resolve()
	}

	return this.getUserDecryptors(request).map((keyDecryptors) => {
		return keyDecryptors.getAllAccessedParents(request, maxdepth-1);
	}), h.sF((parents) => {
		return parents.reduce((prev, parent) => {
			return prev.concat(parent);
		}, [])
	})
};

Key.prototype.getUserDecryptors = function (request, cb) {
	var theKey = this;
	return Decryptor.getAllWithAccess(request, theKey._realid).map(function (decryptor) {
		return decryptor.getDecryptorKey()
	}).filter(function (key) {
		return key && typeof key === "object"
	}).nodeify(cb)
};

/** get this keys decryptors */
Key.prototype.getDecryptors = function getDecryptorsF(request, cb) {
	return Decryptor.getAllWithAccess(request, this._realid).nodeify(cb);
};

Key.prototype.removeDecryptorForUser = function (m, userid, cb) {
	return client.smembersAsync(this._domain + ":accessVia:" + userid).map((decryptorID) => {
		return new Decryptor(this._realid, decryptorID);
	}).each((decryptor) => {
		return Bluebird.fromCallback((cb) => {
			this.removeDecryptor(m, decryptor.getID(), cb);
		})
	}).nodeify(cb);
};

Key.prototype.getPWDecryptors = function (request, cb) {
	return this.getDecryptors(request).filter(function (decryptor) {
		return decryptor.getType().then((type) => {
			return type === "pw"
		})
	}).nodeify(cb);
};

Key.prototype.removeAllPWDecryptors = function (request, cb) {
	var theKey = this, m = client.multi();
	return theKey.getPWDecryptors(request).map((decryptor) => {
		return Bluebird.all([
			client.srem(theKey._domain + ":accessVia:" + request.session.getUserID(), decryptor.getID()),
			decryptor.removeData(m),
		])
	}).then(function () {
		m.exec(this);
	}).nodeify(cb);
};

Key.prototype.removeDecryptor = function (m, decryptorid, cb) {
	return client.smembersAsync(this._domain + ":access").then((accessors) => {
		return this.removeAccess(m, decryptorid, accessors)
	}).then(() => {
		return new Decryptor(this._realid, decryptorid).removeData(m);
	}).nodeify(cb);
};

Key.prototype.removeDecryptorByRealID = function (m, realid, cb) {
	return client.hgetAsync(this._domain + ":decryptor:map", realid).then((decryptorid) => {
		return this.removeDecryptor(m, decryptorid);
	}).nodeify(cb);
};

Key.prototype.removeFromEncryptorLists = function (m, cb) {
	return Decryptor.getAll(this._realid).map(function (decryptor) {
		return decryptor.getDecryptorID();
	}).map((decryptorid) => {
		if (decryptorid) {
			m.srem("key:" + decryptorid + ":encryptors", this._realid);
		}
	}).nodeify(cb);
};

/** warning: side effects possible */
Key.prototype.remove = function (m, cb) {
	return client.keysAsync(this._domain + ":*").then((keys) => {
		keys.forEach((key) => {
			m.del(key);
		});
		m.del(this._domain);

		return this.removeFromEncryptorLists(m);
	}).then(() => {
		return this.getEncryptors();
	}).then((encryptors) => {
		return encryptors.reduce((promise, encryptor) => {
			return promise.then(() => {
				return encryptor.removeDecryptorByRealID(m, this._realid);
			})
		}, Bluebird.resolve())
	}).nodeify(cb);
};

Key.prototype.getDecryptorsJSON = function (request, cb) {
	return this.getDecryptors(request).map((decryptor) => {
			return decryptor.getJSON();
	}).then((decryptors) => {
		if (decryptors.length === 0) {
			console.error("no decryptors for a key!");
		}

		return decryptors
	}).nodeify(cb);
};

/** add one decryptor
* @param request request
* @param data decryptor data
*/
Key.prototype.addDecryptor = function (request, data, cb) {
	return Bluebird.try(() => {
		if (data[this.getRealID()]) {
			data = data[this.getRealID()];
		}

		if (util.isArray(data)) {
			if (data.length === 1) {
				data = data[0];
			} else {
				throw new InvalidDecryptor("multiple to add");
			}
		}

		return Decryptor.create(request, this, data);
	}).nodeify(cb);
};

/** add decryptors
* @param request request
* @param data decryptor data
*/
Key.prototype.addDecryptors = function (request, data, cb) {
	return Bluebird.try(() => {
		if (data[this.getRealID()]) {
			return data[this.getRealID()];
		}

		return data
	}).map((decryptorData) => {
		return Decryptor.create(request, this, decryptorData);
	}).nodeify(cb);
};

/** add a key which is encrypted by this key
* @param realid encrypted keys real id
* @param cb callback
*/
Key.prototype.addEncryptor = (realid, cb) => {
	return client.saddAsync(this._domain + ":encryptors", realid).nodeify(cb)
};

/** get the keys that are encrypted by this key
* @param cb callback
*/
Key.prototype.getEncryptors = function (cb) {
	var KeyApi = require("./KeyApi");

	return client.smembersAsync(this._domain + ":encryptors").map((encryptorID) => {
		return KeyApi.get(encryptorID)
	}).nodeify(cb)
};

Key.prototype.addAccessByRealID = function (keyRealID, userids, added) {
	return client.hgetAsync(this._domain + ":decryptor:map", keyRealID).then((decryptorid) => {
		return this.addAccess(decryptorid, userids, added)
	})
};

/** add access for users to this key
* @param decryptorid decryptor who gives access
* @param userids users to give access
* @param cb callback
* @param added helper for keys already added. prevents loops
*/
Key.prototype.addAccess = function (decryptorid, userids, added = []) {
	var theKey = this;

	if (userids.length === 0) {
		return Bluebird.resolve()
	}

	if (added.indexOf(theKey._realid) > -1) {
		console.log("loop!");
		return Bluebird.resolve()
	}

	return Bluebird.try(() => {
		added = added.slice();

		added.push(theKey._realid);

		return Bluebird.all(userids.map((userid) => {
			return Bluebird.all([
				client.saddAsync(theKey._domain + ":access", userid),
				client.saddAsync(theKey._domain + ":accessVia:" + userid, decryptorid),
			]).then(([accessAdded]) => accessAdded)
		}));
	}).then((added) => {
		if (added.some((added) => added === 1)) {
			return theKey.getEncryptors();
		}

		return []
	}).then((encryptors) => {
		if (encryptors.length === 0) {
			return Bluebird.resolve();
		}

		return Bluebird.resolve(encryptors).map((encryptor) => {
			return encryptor.addAccessByRealID(theKey._realid, userids, added);
		});
	})
};

/** warning: side effects possible */
Key.prototype.removeAccessByRealID = function (m, keyRealID, userids) {
	return client.hgetAsync(this._domain + ":decryptor:map", keyRealID).then((decryptorid) => {
		return this.removeAccess(m, decryptorid, userids);
	})
};

/** remove some access. removes access for users which had it by using a given decryptor
* WARNING: this is not perfect, we have to remove access immediatly (no multi usage)
* to be able to remove keys which are accessed in two ways.
* BUT: if something fails we can - in theory - restore all data
* @param m client multi object
* @param decryptorid decryptor we are coming from. not a realid but an internal id
* @param users users who have typically lost access to the given decryptor
* @param cb callback
*/
Key.prototype.removeAccess = function (m, decryptorid, users, cb) {
	var accessLost, accessors;
	decryptorid = h.parseDecimal(decryptorid);

	return Bluebird.try(() => {
		users = users.slice();
		return client.smembersAsync(this._domain + ":access");
	}).then((_accessors) => {
		accessors = _accessors;
		return Bluebird.all(users.map((userid) => {
			return client.smembersAsync(this._domain + ":accessVia:" + userid);
		}))
	}).then((viaMembers) => {
		var originalMembers = h.joinArraysToObject({
			user: users,
			via: viaMembers
		});

		var members = originalMembers.filter((member) => {
			member.via = member.via.map(h.parseDecimal);
			return member.via.indexOf(decryptorid) > -1;
		});

		accessLost = members.filter((member) => {
			return member.via.length === 1;
		});

		if (accessLost.length === accessors.length) {
			//no decryptors left: remove key
			return this.remove(m).thenReturn(Bluebird.reject(new BreakPromiseChain()))
		}

		var m2 = client.multi();
		members.forEach((member) => {
			m2.srem(this._domain + ":accessVia:" + member.user, decryptorid);
		});

		accessLost.forEach((member) => {
			m2.srem(this._domain + ":access", member.user);
		});

		if (members.length === 0) {
			return Bluebird.reject(new BreakPromiseChain());
		}

		return Bluebird.fromCallback((cb) => m2.exec(cb))
	}).then(() => {
		if (accessLost.length === 0) {
			return Bluebird.reject(new BreakPromiseChain());
		}

		return this.getEncryptors();
	}).then((encryptors) => {
		if (encryptors.length === 0) {
			return Bluebird.reject(new BreakPromiseChain());
		}

		var accessIDs = accessLost.map((member) => { return member.user; });

		return encryptors.reduce((promise, encryptor) => {
			return promise.then(() =>
				encryptor.removeAccessByRealID(m, this._realid,  accessIDs)
			)
		}, Bluebird.resolve())
	}).catch(BreakPromiseChain, () => {}).nodeify(cb);
};

Key.prototype.hasUserAccess = function (userid) {
	var theKey = this;
	return Bluebird.all([
		client.sismemberAsync(theKey._domain + ":access", userid),
		theKey.getOwner(),
	]).spread((access, owner) => {
		if (access === 1) {
			return true
		}

		if (parseInt(owner, 10) === parseInt(userid, 10)) {
			return true
		}

		return false
	})
};

/** checks if the current user has access to this key
* @param request users request
* @param cb callback
*/
Key.prototype.hasAccess = function (request, cb) {
	return this.hasUserAccess(request.session.getUserID()).nodeify(cb);
};

/** get the users who have access to this key */
Key.prototype.getAccess = function getAccessF(cb) {
	return client.smembersAsync(this._domain + ":access").nodeify(cb);
};

/** count how many users have access to this key */
Key.prototype.accessCount = function () {
	return client.scardAsync(this._domain + ":access");
};

module.exports = Key;
