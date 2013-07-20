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
	iv: h.isHex
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
				client.set(domain + ":data", JSON.stringify(data), this);
			} else {
				throw new InvalidProfile();
			}
		}), cb);
	};

	this.removeAttribute = function removeAttributeF() {

	};

	this.remove = function removeF() {

	};
};

Profile.validate = function validateF(data) {
	if (!h.validateObjects(structure, data)) {
		return false;
	}

	if (!h.isHex(data.iv)) {
		return false;
	}

	return true;
};

Profile.create = function createF(view, key, data, cb) {
	var profile, userID, profileID;
	step(function () {
		if (!Profile.validate(data)) {
			throw new InvalidProfile();
		}

		data = true;

		//TODO: check for logedin!
		if (typeof key !== "object") {
			Key.get(key, this);
		} else {
			this.ne(key);
		}
	}, h.sF(function (key) {
		userID = view.getUserID();
		if (key.isSymKey()) {
			client.incr("user:" + userID + ":profileCount", this);
		} else {
			throw new NotASymKey();
		}
	}), h.sF(function (id) {
		profileID = id;
		client.sadd("user:" + userID + ":profiles", profileID, this);
	}), h.sF(function () {
		profile = new Profile(userID, profileID);
		profile.setData(view, data, this);
	}), h.sF(function () {
		this.ne(profile);
	}), cb);
};