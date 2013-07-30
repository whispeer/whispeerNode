"use strict";

var Key = require("./crypto/Key");

var step = require("step");
var client = require("./redisClient");
var h = require("./helper");

var structure = {
	basic: {
		firstname: h.isHex,
		lastname: h.isHex,
		birthday: h.isHex
	},
	iv: h.isHex,
	signature: h.isHex,
	key: h.isRealID
};

var Profile = function (userid, profileid) {
	var theProfile = this;
	var domain = "user:" + userid + ":profile:" + profileid;
	this.getData = function getDataF(cb) {
		step(function () {
			client.get(domain + ":data", this);
		}, h.sF(function (profileData) {
			var profile = JSON.parse(profileData);
			if (Profile.validate(profile)) {
				this.ne(profile);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	this.setData = function setDataF(view, data, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			theProfile.getData(this);
		}), h.sF(function (oldData) {
			var extend = require("xtend");
			data = extend(oldData, data);

			if (Profile.validate(data)) {
				Key.get(data.key, this);
			} else {
				throw new InvalidProfile();
			}
		}), h.sF(function (key) {
			if (key.isSymKey()) {
				delete data.key;

				client.set(domain + ":data", JSON.stringify(data), this.parallel());
				client.set(domain + ":key", key.getRealID(), this.parallel());
			} else {
				throw new InvalidProfile();
			}
		}), cb);
	};

	this.removeAttribute = function removeAttributeF(view, attr, cb) {
		step(function () {
			theProfile.getData(this);
		}, h.sF(function (oldData) {
			var attribute = attr.pop();
			var branch = h.deepGet(oldData, attr);

			if (branch && branch[attribute]) {
				delete branch[attribute];

				theProfile.setData(view, oldData, this);
			} else {
				this.last.ne(true);
			}
		}), cb);
	};

	this.getKey = function getKeyF(view, cb) {
		step(function () {
			view.logedinError(this);
		}, h.sF(function () {
			client.get(domain + ":key", this);
		}), h.sF(function (keyRealID) {
			Key.get(keyRealID, this);
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
			key.hasAccess(view, this);
		}), cb);
	};

	this.remove = function removeF() {
		//TODO
		//client.sadd("user:" + userid + ":profiles", profileid, this.parallel());
		//client.del(domain + ":data", this.parallel());
	};
};

function getAllProfiles(view, userid, cb) {
	step(function () {
		view.logedinError(this);
	}, h.sF(function () {
		client.smembers("user:" + userid + ":profiles", this);
	}), h.sF(function (profiles) {
		var result = [];
		var i;
		for (i = 0; i < profiles.length; i += 1) {
			result.push(new Profile(userid, profiles[i]));
		}

		this.ne(result);
	}), cb);
}

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
		if (view.getUserID() === userid) {
			this.last.ne(p);
		} else {
			profiles = p;
			var i;
			for (i = 0; i < profiles.length; i += 1) {
				profiles.hasAccess(view, this.parallel());
			}
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
	if (!h.validateObjects(structure, data)) {
		return false;
	}

	if (!data.iv || !data.key || !data.signature) {
		return false;
	}

	return true;
};

Profile.create = function createF(view, data, cb) {
	var profile, userID, profileID;
	step(function createP1() {
		view.logedinError(this);
	}, h.sF(function createP2() {
		if (!Profile.validate(data)) {
			throw new InvalidProfile();
		}

		Key.get(data.key, this);
	}), h.sF(function createP3(key) {
		userID = view.getUserID();
		if (key && key.isSymKey()) {
			client.incr("user:" + userID + ":profileCount", this);
		} else {
			throw new NotASymKey();
		}
	}), h.sF(function createP4(id) {
		profileID = id;
		client.sadd("user:" + userID + ":profiles", profileID, this);
	}), h.sF(function () {
		profile = new Profile(userID, profileID);
		profile.setData(view, data, this);
	}), h.sF(function () {
		this.ne(profile);
	}), cb);
};

module.exports = Profile;