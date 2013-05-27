"use strict";

var step = require("step");
var h = require("./includes/helper");

require("./includes/errors.js");

var whispeerAPI = {
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
	register: function (data, fn) {
		//TODO
	},
	login: function (data, fn) {
		var mySession;
		step(function () {
			var Session = require("./includes/session");
			mySession = new Session();
			mySession.login(data.identifier, data.password, data.token, this);
		}, h.sF(function (sid) {
			this.ne({
				session: sid
			});
		}), fn);
		console.log(data);
		fn(null, {result: "success"});
	}
};

module.exports = whispeerAPI;