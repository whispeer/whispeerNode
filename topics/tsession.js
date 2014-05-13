"use strict";

var step = require("step");
var h = require("whispeerHelper");

var mailer = require("../includes/mailer");

var s = {
	logout: function logoutF(data, fn, view) {
		step(function () {
			if (data && data.logout === true) {
				view.logout(this);
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
	register: function (data, fn, view) {
		var res, myUser;
		step(function () {
			view.getSession().register(data.mail, data.nickname, data.password, data.keys, data.settings, view, this);
		}, h.sF(function (result) {
			res = result;
			if (result.error) {
				this.last.ne(res);
			} else {
				view.getSession().getOwnUser(this);
			}
		}), h.sF(function (user) {
			myUser = user;
			if (data.profile) {
				if (data.profile.pub) {
					myUser.setPublicProfile(view, data.profile.pub, this.parallel());
				}

				if (data.profile.priv && data.keys.profile) {
					var i;
					for (i = 0; i < data.profile.priv.length; i += 1) {
						myUser.createPrivateProfile(view, data.profile.priv[i], this.parallel());
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

module.exports = s;