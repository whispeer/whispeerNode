"use strict";

var step = require("step");
var h = require("whispeerHelper");

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
		var res;
		step(function () {
			view.getSession().register(data.mail, data.nickname, data.password, data.keys, data.settings, view, this);
		}, h.sF(function (result) {
			console.log(result);
			res = result;
			if (result.error) {
				this.last.ne(res);
			} else {
				view.getSession().getOwnUser(this);
			}
		}), h.sF(function (myUser) {
			if (data.profile) {
				if (data.profile.pub) {
					myUser.setPublicProfile(view, data.profile.pub, this.parallel());
				}

				if (data.profile.priv && data.keys.profile) {
					myUser.createPrivateProfile(view, data.keys.profile, data.profile.priv, this.parallel());
				}
			}

			this.parallel()();
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