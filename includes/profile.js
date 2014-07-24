"use strict";

var KeyApi = require("./crypto/KeyApi");

var step = require("step");
var client = require("./redisClient");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var jsonFields = ["profile", "own"];

var Profile = function (userid, profileid) {
	var theProfile = this;
	var domain = "user:" + userid + ":profile:" + profileid;
	this.getPData = function getPDataF(request, cb, wKeyData) {
		var result;
		step(function () {
			client.hgetall(domain, this);
		}, h.sF(function (profileData) {
			result = h.unStringifyCertainAttributes(profileData, jsonFields);

			result.profileid = profileid;

			var err = validator.validate("profileEncrypted", result.profile, 1);

			if (!err) {
				if (wKeyData) {
					KeyApi.getWData(request, result.key, this, true);
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

	this.listen = function doListenF(request, cb) {
		request.socketData.sub(domain, function (data) {
			cb(JSON.parse(data));
		});
	};

	this.setData = function setDataF(request, data, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			if (Profile.validate(data)) {
				data = h.stringifyCertainAttributes(data, jsonFields);

				client.hmset(domain, data, this);
				client.publish(domain, data.profile);
			} else {
				throw new InvalidProfile();
			}
		}), cb);
	};

	this.getKey = function getKeyF(request, cb) {
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.hget(domain, "key", this);
		}), h.sF(function (keyRealID) {
			KeyApi.get(keyRealID, this);
		}), cb);
	};

	this.hasAccess = function hasAccessF(request, cb) {
		step(function () {
			if (request.session.getUserID() === userid) {
				this.last.ne(true);
			} else {
				theProfile.getKey(request, this);
			}
		}, h.sF(function (key) {
			if (!key) {
				throw new Error("key not existing");
			}

			key.hasAccess(request, this);
		}), cb);
	};

	this.remove = function removeF(request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.srem("user:" + userid + ":profiles", profileid, this);
		}), cb);
	};
};

function getAllProfiles(request, userid, cb) {
	step(function getAP1() {
		request.session.logedinError(this);
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

Profile.get = function get(request, profileid, cb) {
	step(function () {
		client.sismember("user:" + request.session.getUserID() + ":profiles", profileid, this);
	}, h.sF(function (exists) {
		if (exists) {
			this.ne(new Profile(request.session.getUserID(), profileid));
		} else {
			this.ne(false);
		}
	}), cb);
};

Profile.getOwn = function getOwnF(request, cb) {
	step(function () {
		getAllProfiles(request, request.session.getUserID(), this);
	}, cb);
};

Profile.getAccessed = function getAccessedF(request, userid, cb) {
	var profiles;
	step(function () {
		getAllProfiles(request, userid, this);
	}, h.sF(function (p) {
		profiles = p;
		if (request.session.getUserID() === userid) {
			this.last.ne(p);
		} else {
			var i;
			for (i = 0; i < profiles.length; i += 1) {
				profiles[i].hasAccess(request, this.parallel());
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
	var content = data.profile.content, meta = data.profile.meta;
	var err = validator.validate("profileEncrypted", content, 1);

	return !err && meta._signature && meta._hashObject && meta._contentHash && meta._key && meta._version;
};

Profile.create = function createF(request, data, cb) {
	var profile, userID, profileID;
	step(function createP1() {
		request.session.logedinError(this);
	}, h.sF(function createP2() {
		if (!Profile.validate(data)) {
			console.error("Profile invalid. not creating!");
			this.last.ne(false);
			return;
		}


		var meta = data.profile.meta;
		KeyApi.get(meta._key, this);
	}), h.sF(function createP3(key) {
		userID = request.session.getUserID();
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
		profile.setData(request, data, this, true);
	}), h.sF(function () {
		this.ne(profile);
	}), cb);
};

module.exports = Profile;