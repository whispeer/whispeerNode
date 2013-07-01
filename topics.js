"use strict";

var step = require("step");
var h = require("./includes/helper");

require("./includes/errors.js");

var whispeerAPI = {
	priorized: ["addKeys"],
	addKeys: function addKeysF(data, fn) {
		step(function () {
			//TODO: data.addKeys
			var i;
			for (i = 0; i <  data.addKeys.length; i += 1) {
				cur = data.addKeys[i];

				cur.type = cur.type.toLowerCase();

				switch (cur.type) {
					case "sym":
						SymKey.createWithDecryptors(cur, this.parallel());
						break;
					case "crypt":
						EccKey.createWithDecryptors(cur, this.parallel());
						break;
					case "sign":
						EccKey.createWithDecryptors(cur, this.parallel());
						break;
					default:
						fn.error.protocol();
						return;
				}
			}

			//TODO: data.addKeyDecryptors
			this.parallel()();
		}, h.sF(function (keys) {
			
		}), fn);
	},
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
		var myUser;
		step(function () {
			view.getSession().register(data.mail, data.nickname, data.password, data.mainKey, data.signKey, data.cryptKey, view, this);
		}, h.sF(function (result) {
			this.ne(result);
		}), fn);
		//TODO add keys
	},
	login: function (data, fn, view) {
		var mySession;
		step(function () {
			console.log(data);
			mySession = view.getSession();
			mySession.login(view, data.identifier, data.password, data.token, this);
		}, h.sF(function (sid) {
			this.ne({
				session: sid
			});
		}), fn);
	}
};

module.exports = whispeerAPI;