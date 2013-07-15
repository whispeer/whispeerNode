"use strict";

/* global require, UserNotExisting, module, console */

var step = require("step");
var h = require("./includes/helper");

var SymKey = require("./includes/crypto/symKey");
var EccKey = require("./includes/crypto/eccKey");

var whispeerAPI = {
	priorized: ["keyData"],
	logout: function logoutF(data, fn, view) {
		step(function () {
			if (data === true) {
				view.logout(this);
			}
		}, fn);
	},
/*	keyData: function addKeysF(data, fn, view) {
		var addedKeys, decryptorKeys;
		step(function () {
			debugger;

			var i, cur;

			for (i = 0; i < data.addKeys.length; i += 1) {
				cur = data.addKeys[i];

				cur.type = cur.type.toLowerCase();

				switch (cur.type) {
				case "sym":
					SymKey.create(view, cur, this.parallel());
					break;
				case "crypt":
				case "sign":
					EccKey.create(view, cur, this.parallel());
					break;
				default:
					fn.error.protocol();
					return;
				}
			}

			this.parallel()();
		}, h.sF(function (keys) {
			var Key = require("./includes/crypto/key");
			addedKeys = keys;
			decryptorKeys = Object.keys(data.addKeyDecryptors);

			Key.getKeys(decryptorKeys, this);
		}), h.sF(function (keys) {
			var i, curKey, curDec;
			for (i = 0; i < keys.length; i += 1) {
				curKey = keys[i];

				if (curKey) {
					curDec = data.addKeyDecryptors[curKey.getRealID()];

					if (curKey) {
						curKey.addDecryptors(view, curDec, this.parallel());
					}
				} else {
					console.log("Key not found: " + decryptorKeys[i]);
				}
			}
		}), h.sF(function () {
			console.log(arguments);
			var result = {
				keysAdded: addedKeys
			};

			this.ne(result);
		}), fn);
	},*/
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
	},
	token: function getToken(data, fn) {
		step(function () {
			if (data && data.identifier) {
				var User = require("./includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, myUser) {
			if (e) {
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				myUser.generateToken(this);
			}
		}, UserNotExisting), h.sF(function (token) {
			if (token !== false) {
				this.last.ne({token: token});
			} else {
				fn.error();
				this.last.ne();
			}
		}), fn);
	},
	register: function (data, fn, view) {
		step(function () {
			view.getSession().register(data.mail, data.nickname, data.password, data.mainKey, data.signKey, data.cryptKey, data.decryptors, view, this);
		}, h.sF(function (result) {
			this.ne(result);
		}), fn);
	},
	login: function (data, fn, view) {
		var mySession;
		step(function () {
			console.log(data);
			mySession = view.getSession();
			mySession.login(view, data.identifier, data.password, data.token, this);
		}, h.sF(function (success) {
			this.ne({
				login: success
			});
		}), fn);
	}
};

module.exports = whispeerAPI;