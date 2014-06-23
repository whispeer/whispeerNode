"use strict";

var step = require("step");
var h = require("whispeerHelper");

var mailer = require("../includes/mailer");

var s = {
	logout: function logoutF(data, fn, request) {
		step(function () {
			if (data && data.logout === true) {
				request.session.logout(this);
			}
		}, fn);
	},
	token: function getToken(data, fn) {
		step(function () {
			if (data && data.identifier) {
				var User = require("../includes/user");
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
	register: function (data, fn, request) {
		var res, myUser;
		step(function () {
			request.session.register(data.mail, data.nickname, data.password, data.keys, data.settings, request, this);
		}, h.sF(function (result) {
			res = result;
			if (result.error) {
				this.last.ne(res);
			} else {
				request.session.getOwnUser(this);
			}
		}), h.sF(function (user) {
			myUser = user;
			if (data.profile) {
				if (data.profile.pub) {
					myUser.setPublicProfile(request, data.profile.pub, this.parallel());
				}

				if (data.profile.priv && data.keys.profile) {
					var i;
					for (i = 0; i < data.profile.priv.length; i += 1) {
						myUser.createPrivateProfile(request, data.profile.priv[i], this.parallel());
					}
				}
			}

			this.parallel()();
		}), h.sF(function () {
			mailer.sendAcceptMail(myUser, this);
		}), h.sF(function () {
			this.ne(res);
		}), fn);
	},
	login: function (data, fn, request) {
		var mySession;
		step(function () {
			console.log(data);
			mySession = request.session;
			mySession.login(request, data.identifier, data.password, data.token, this);
		}, h.sF(function (success) {
			this.ne({
				login: success
			});
		}), fn);
	}
};

module.exports = s;