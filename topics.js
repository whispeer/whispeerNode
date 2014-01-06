"use strict";

var step = require("step");
var h = require("whispeerHelper");

var user = require("./topics/tuser");
var session = require("./topics/tsession");
var messages = require("./topics/tmessage");
var friends = require("./topics/tfriends");
var circles = require("./topics/tcircles");
var posts = require("./topics/tposts");
var KeyApi = require("./includes/crypto/KeyApi");
var settings = require("./includes/settings");

var whispeerAPI = {
	priorized: ["keyData"],
	logedin: function isLogedinF(data, fn, view) {
		step(function () {
			if (data === true) {
				view.logedin(this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (logedin) {
			this.ne(logedin);
		}), fn);
	},
	key: {
		get: function getKeyChainF(data, fn, view) {
			var theKey, result = [];
			step(function () {
				KeyApi.get(data.realid, this);
			}, h.sF(function (key) {
				if (!key) {
					throw "could not load key:" + data.realid;
				}
				var MAXDEPTH = 20;

				theKey = key;
				theKey.getAllAccessedParents(view, this, MAXDEPTH);
			}), h.sF(function (parents) {
				var i;
				if (data.loaded && Array.isArray(data.loaded)) {
					for (i = 0; i < parents.length; i += 1) {
						if (data.loaded.indexOf(parents[i].getRealID()) === -1) {
							result.push(parents[i]);
						}
					}
				}

				result.push(theKey);

				for (i = 0; i < result.length; i += 1) {
					result[i].getKData(view, this.parallel(), true);
				}
			}), h.sF(function (keys) {
				this.ne({keychain: keys});
			}), fn);
		},
		addFasterDecryptors: function addFasterDecryptorF(data, fn, view) {
			var keys;
			step(function () {
				var key;
				for (key in data.keys) {
					if (data.keys.hasOwnProperty(key)) {
						KeyApi.get(key, this.parallel());
					}
				}
			}, h.sF(function (k) {
				keys = k;
				var i;
				for (i = 0; i < keys.length; i += 1) {
					keys[i].addFasterDecryptor(view, data.keys[keys[i].getRealID()][0], this.parallel());
				}
			}), h.sF(function (success) {
				var result = {}, i;

				for (i = 0; i < success.length; i += 1) {
					result[keys[i].getRealID()] = success[i];
				}
			}), fn);
		}
	},
	settings: {
		getSettings: function (data, fn, view) {
			step(function () {
				settings.getOwnSettings(view, this);
			}, h.sF(function (settings) {
				this.ne({
					settings: settings
				});
			}), fn);
		},
		setSettings: function (data, fn, view) {
			step(function () {
				settings.setOwnSettings(view, data.settings, this);
			}, h.sF(function (result) {
				this.ne({
					success: result
				});
			}), fn);
		}
	},
	circles: circles,
	friends: friends,
	messages: messages,
	user: user,
	session: session,
	posts: posts,
	nicknameFree: function isNickNameFree(data, fn) {
		step(function () {
			if (data && data.nickname) {
				if (h.isNickname(data.nickname)) {
					var User = require("./includes/user");
					User.getUser(data.nickname, this);
				} else {
					this.last.ne({
						nicknameUsed: true
					});
				}
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e) {
			if (e) {
				this.ne({
					nicknameUsed: false
				});
			} else {
				this.ne({
					nicknameUsed: true
				});
			}
		}, UserNotExisting), fn);
	},
	mailFree: function isMailFree(data, fn) {
		step(function () {
			if (data && data.mail) {
				if (h.isMail(data.mail)) {
					var User = require("./includes/user");
					User.getUser(data.mail, this);
				} else {
					this.last.ne({
						mailUsed: true
					});
				}
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e) {
			if (e) {
				this.ne({
					mailUsed: false
				});
			} else {
				this.ne({
					mailUsed: true
				});
			}
		}, UserNotExisting), fn);
	}
};

module.exports = whispeerAPI;