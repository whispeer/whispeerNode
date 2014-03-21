"use strict";

var KeyApi = require("./crypto/KeyApi");
var SymKey = require("./crypto/symKey");

var step = require("step");
var client = require("./redisClient");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var jsonFields = ["profile", "hashObject", "metaData"];

var Profile = function (userid, profileid) {
	var theProfile = this;
	var domain = "user:" + userid + ":profile:" + profileid;
	this.getPData = function getPDataF(view, cb, wKeyData) {
		var result;
		step(function () {
			client.hgetall(domain, this);
		}, h.sF(function (profileData) {
			result = h.unStringifyCertainAttributes(profileData, jsonFields);

			result.profileid = profileid;

			var err = validator.validate("profileEncrypted", result.profile, 1);

			if (!err) {
				if (wKeyData) {
					KeyApi.getWData(view, result.key, this, true);
				} else {
					this.ne(result.key);
				}
			} else {
				this.last.ne(false);
			}
		}), h.sF(function (key) {
			result.profile.key = key;
			this.last.ne(result);
		}), cb);
	};

	this.listen = function doListenF(view, cb) {
		view.sub(domain, function (data) {
			cb(JSON.parse(data));
		});
	};

	this.setData = function setDataF(view, data, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			var err = validator.validate("profileEncrypted", data.profile, 1);

			if (!data.signature || !data.hashObject) {
				throw new InvalidProfile();
			}

			data = h.stringifyCertainAttributes(data, jsonFields);

			if (!err) {
				client.hmset(domain, data, this);
				client.publish(domain, data.profile);
			} else {
				throw new InvalidProfile();
			}
		}), cb);
	};

	this.getKey = function getKeyF(view, cb) {
		step(function () {
			view.logedinError(this);
		}, h.sF(function () {
			client.hget(domain, "key", this);
		}), h.sF(function (keyRealID) {
			KeyApi.get(keyRealID, this);
		}), cb);
	};

	this.hasAccess = function hasAccessF(view, cb) {
		step(function () {
			if (view.getUserID() === userid) {
				this.last.ne(true);
			} else {
				theProfile.getKey(view, this);
			}
		}, h.sF(function (key) {
			if (!key) {
				throw new Error("key not existing");
			}

			key.hasAccess(view, this);
		}), cb);
	};

	this.remove = function removeF(view, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			client.srem("user:" + userid + ":profiles", profileid, this);
		}), cb)
	};
};

function getAllProfiles(view, userid, cb) {
	step(function getAP1() {
		view.logedinError(this);
	}, h.sF(function getAP2() {
		client.smembers("user:" + userid + ":profiles", this);
	}), h.sF(function getAP3(profiles) {
		var result = [];
		var i;
		for (i = 0; i < profiles.length; i += 1) {
			result.push(new Profile(userid, profiles[i]));
		}

		this.ne(result);
	}), cb);
}

Profile.get = function get(view, profileid, cb) {
	step(function () {
		client.sismember("user:" + view.getUserID() + ":profiles", profileid, this);
	}, h.sF(function (exists) {
		if (exists) {
			this.ne(new Profile(view.getUserID(), profileid));
		} else {
			this.ne(false);
		}
	}), cb);
};

Profile.getOwn = function getOwnF(view, cb) {
	step(function () {
		getAllProfiles(view, view.getUserID(), this);
	}, cb);
};

Profile.getAccessed = function getAccessedF(view, userid, cb) {
	var profiles;
	step(function () {
		getAllProfiles(view, userid, this);
	}, h.sF(function (p) {
		profiles = p;
		if (view.getUserID() === userid) {
			this.last.ne(p);
		} else {
			var i;
			for (i = 0; i < profiles.length; i += 1) {
				profiles[i].hasAccess(view, this.parallel());
			}
		}

		if (profiles.length === 0) {
			this.ne([]);
		}
	}), h.sF(function (acc) {
		var i, result = [];
		if (acc.length !== profiles.length) {
			throw "bug ... length are not the same!";
		}

		for (i = 0; i < acc.length; i += 1) {
			if (acc[i]) {
				result.push(profiles[i]);
			}
		}

		this.ne(result);
	}), cb);
};

Profile.validate = function validateF(data) {
	var err = validator.validate("profileEncrypted", data.profile, 1);

	return !err && data.signature && data.hashObject;
};

Profile.create = function createF(view, data, cb) {
	var profile, userID, profileID;
	step(function createP1() {
		view.logedinError(this);
	}, h.sF(function createP2() {
		if (!Profile.validate(data)) {
			this.last.ne(false);
			return;
		}

		if (typeof data.profile.key !== "object") {
			KeyApi.get(data.profile.key, this);
		} else if (!KeyApi.isKey(key)) {
			SymKey.createWDecryptors(view, data.profile.key, this);
		} else {
			this.ne(data.profile.key);
		}
	}), h.sF(function createP3(key) {
		userID = view.getUserID();
		if (key && key.isSymKey()) {
			data.profile.key = key.getRealID();
			client.incr("user:" + userID + ":profileCount", this);
		} else {
			throw new NotASymKey();
		}
	}), h.sF(function createP4(id) {
		profileID = id;
		client.multi()
			.sadd("user:" + userID + ":profiles", profileID)
			.hset("user:" + userID + ":profile:" + profileID, "key", data.profile.key)
			.exec(this);
	}), h.sF(function () {
		profile = new Profile(userID, profileID);
		profile.setData(view, data, this, true);
	}), h.sF(function () {
		this.ne(profile);
	}), cb);
};

module.exports = Profile;