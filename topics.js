"use strict";

var step = require("step");
var h = require("./includes/helper");

require("./includes/errors.js");

var whispeerAPI = {
	nicknameFree: function isUserNameFree(data, fn) {
		step(function () {
			if (data && data.username && h.isNickname(data.username)) {
				var User = require("./includes/user");
				User.getUser(data.username, this);
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
			if (data && data.mail && h.isMail(data.username)) {
				var User = require("./includes/user");
				User.getUser(data.mail, this);
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
	salt: function getSalt(data, fn) {
		step(function () {
			if (data && data.identifier) {
				var User = require("./includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (myUser) {
			myUser.getSalt(this);
		}), h.hE(function (e, salt) {
			if (e) {
				fn.error({userNotExisting: true});

				this.last.ne();
			} else {
				this.ne({salt: salt});
			}
		}, UserNotExisting), fn);
	},
	login: function (data, fn) {
		step(function () {
			var Session = require("./includes/session");
			var mySession = new Session();
			mySession.login(data.identifier, data.password, this):
		}
		console.log(data);
		fn(null, {result: "success"});
	}
};

module.exports = whispeerAPI;