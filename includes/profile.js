"use strict";

var KeyApi = require("./crypto/KeyApi");

var step = require("step");
var client = require("./redisClient");
var h = require("whispeerHelper");

var Session = require("./session");

var validator = require("whispeerValidations");
var RedisObserver = require("./asset/redisObserver");

var Profile = function (userid, profileid) {
	var theProfile = this;
	var domain = "user:" + userid + ":profile:" + profileid;
	this.getPData = function getPDataF(request, cb) {
		var result;
		step(function () {
			this.parallel.unflatten();
			client.get(domain + ":content", this.parallel());
			client.hgetall(domain + ":meta", this.parallel());
		}, h.sF(function (content, meta) {
			result = {
				content: JSON.parse(content),
				meta: meta,
				profileid: profileid
			};

			request.addKey(result.meta._key, this);
		}), h.sF(function () {
			this.last.ne(result);
		}), cb);
	};

	this.setData = function setDataF(request, data, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			if (Profile.validate(data)) {
				var content = data.content, meta = data.meta;

				client.multi()
					.set(domain + ":content", JSON.stringify(content))
					.hmset(domain + ":meta", meta)
					.exec(this);
				theProfile.notify("update", data);
			} else {
				throw new InvalidProfile();
			}
		}), cb);
	};

	this.getKey = function getKeyF(request, cb) {
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "_key", this);
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

	this.remove = function removeF(m) {
		m.srem("user:" + userid + ":profiles", profileid, this).
		del(domain + ":meta").
		del(domain + ":content");
	};

	this.getID = function () {
		return profileid;
	};

	RedisObserver.call(this, "user: " + userid + ":profile", profileid);
};

function getAllProfiles(request, userid, cb) {
	step(function getAP1() {
		request.session.logedinError(this);
	}, h.sF(function getAP2() {
		client.smembers("user:" + userid + ":profiles", this);
	}), h.sF(function getAP3(profiles) {
		this.ne(profiles.map(function (pid) {
			return new Profile(userid, pid);
		}));
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

Profile.getAccessed = function getAccessedF(request, userid, cb) {
	var profiles;
	step(function () {
		getAllProfiles(request, userid, this);
	}, h.sF(function (p) {
		profiles = p;
		profiles.forEach(function (profile) {
			profile.hasAccess(request, this.parallel());
		}, this);

		if (profiles.length === 0) {
			this.last.ne([]);
		}
	}), h.sF(function (acc) {
		var result = profiles.filter(function (profile, index) {
			return acc[index];
		});

		this.ne(result);
	}), cb);
};

Profile.validate = function validateF(data) {
	var content = data.content, meta = data.meta;
	var err = validator.validate("profileEncrypted", content, 1);

	return !err && meta._signature && meta._contentHash && meta._key && meta._version;
};

function generateProfileID(request, cb) {
	var pid;
	step(function () {
		Session.code(20, this);
	}, h.sF(function (_pid) {
		pid = _pid;
		client.sadd("user:" + request.session.getUserID() + ":profiles", pid, this);
	}), h.sF(function (added) {
		if (added === 0) {
			process.nextTick(function () {
				generateProfileID(request, cb);
			});
		} else {
			this.ne(pid);
		}
	}), cb);
}

Profile.create = function createF(request, data, cb) {
	var profile;
	step(function createP1() {
		request.session.logedinError(this);
	}, h.sF(function createP2() {
		if (!Profile.validate(data)) {
			console.error("Profile invalid. not creating!");
			this.last.ne(false);
			return;
		}

		var meta = data.meta;
		KeyApi.get(meta._key, this);
	}), h.sF(function createP3(key) {
		if (key && key.isSymKey()) {
			generateProfileID(request, this);
		} else {
			throw new NotASymKey();
		}
	}), h.sF(function createP4(profileID) {
		profile = new Profile(request.session.getUserID(), profileID);
		profile.setData(request, data, this);
	}), h.sF(function () {
		this.ne(profile);
	}), cb);
};

Profile.deleteAllExcept = function (request, except, cb) {
	step(function () {
		getAllProfiles(request, request.session.getUserID(), this);
	}, h.sF(function (profiles) {
		var toDelete = profiles.filter(function (profile) {
			return profile.getID() !== except;
		});

		if (toDelete.length !== profiles.length - 1) {
			throw new Error("except is not one of our profiles.");
		}

		if (toDelete.length === 0) {
			this.ne();
			return;
		}

		var m = client.multi();

		toDelete.forEach(function (profile) {
			profile.remove(m);
		}, this);

		m.exec(this);
	}), cb);
};

module.exports = Profile;
