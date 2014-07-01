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

var blob = require("./topics/tblob");
var mailer = require("./includes/mailer");

var MAXDEPTH = 20;

//change api style:
//extract objects with methods:
//get
//getMultiple
//create
//delete
//exists
//more actions (e.g. verify)
//seperate message, topic
//seperate timeline, post
//more crud

var whispeerAPI = {
	blob: blob,
	verifyMail: function verifyMailF(data, fn) {
		step(function () {
			mailer.verifyUserMail(data.challenge, data.mailsEnabled, this);
		}, h.sF(function (success) {
			this.ne({
				mailVerified: success
			});
		}), fn);
	},
	logedin: function isLogedinF(data, fn, request) {
		step(function () {
			if (data === true) {
				request.session.logedin(this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (logedin) {
			this.ne(logedin);
		}), fn);
	},
	ping: function (data, fn) {
		step(function () {
			this.ne({
				pong: true
			});
		}, fn);
	},
	key: {
		getMultiple: function (data, fn, request) {
			step(function () {
				if (data.realids.length === 0) {
					this.last.ne();
				}

				data.realids.forEach(function (e) {
					request.addKey(e, this.parallel());
				}, this);
			}, fn);
		},
		get: function getKeyChainF(data, fn, request) {
			var theKey, result = [];
			step(function () {
				KeyApi.get(data.realid, this);
			}, h.sF(function (key) {
				if (!key) {
					throw "could not load key:" + data.realid;
				}

				theKey = key;
				theKey.getAllAccessedParents(request, this, MAXDEPTH);
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
					result[i].getKData(request, this.parallel(), true);
				}
			}), h.sF(function (keys) {
				this.ne({keychain: keys});
			}), fn);
		},
		addFasterDecryptors: function addFasterDecryptorF(data, fn, request) {
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
					keys[i].addFasterDecryptor(request, data.keys[keys[i].getRealID()][0], this.parallel());
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
		getSettings: function (data, fn, request) {
			step(function () {
				settings.getOwnSettings(request, this);
			}, h.sF(function (settings) {
				this.ne({
					settings: settings
				});
			}), fn);
		},
		setSettings: function (data, fn, request) {
			step(function () {
				settings.setOwnSettings(request, data.settings, this);
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