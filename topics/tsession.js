"use strict";

var step = require("step");
var h = require("whispeerHelper");

var mailer = require("../includes/mailer");
var invites = require("../includes/invites");
var errorService = require("../includes/errorService");

var s = {
	logout: function logoutF(data, fn, request) {
		step(function () {
			if (data && data.logout === true) {
				request.session.logout(this);
			}
		}, fn);
	},
	token: function getToken(data, fn, request) {
		step(function () {
			if (data && data.identifier) {
				var User = require("../includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, myUser) {
			if (e) {
				errorService.handleError(e, request);
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				this.parallel.unflatten();
				myUser.generateToken(this.parallel());
				myUser.getSalt(request, this.parallel());
			}
		}, UserNotExisting), h.sF(function (token, salt) {
			if (token !== false) {
				this.last.ne({token: token, salt: salt});
			} else {
				fn.error();
				this.last.ne();
			}
		}), fn);
	},
	register: function (data, fn, request) {
		var res, myUser;
		step(function () {
			request.session.register(data.mail, data.nickname, data.password, data.keys, data.settings, data.signedKeys, data.signedOwnKeys, request, this);
		}, h.sF(function (result) {
			res = result;
			if (result.error) {
				this.last.ne(res);
			} else {
				request.session.getOwnUser(this);
			}
		}), h.sF(function (user) {
			myUser = user;
			if (data.profile.pub) {
				myUser.setPublicProfile(request, data.profile.pub, this.parallel());
			}

			if (data.profile.priv && data.keys.profile) {
				data.profile.priv.forEach(function (profile) {
					myUser.createPrivateProfile(request, profile, this.parallel());
				}, this);
			}

			myUser.setMyProfile(request, data.profile.me, this.parallel());
		}), h.sF(function (valid) {
			if (!valid.reduce(h.and, true)) {
				console.error("could not create profiles. TODO: delete user!");
			}

			mailer.sendAcceptMail(myUser, this.parallel());
			invites.useCode(myUser, data.inviteCode, this.parallel());
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

s.logout.noLoginNeeded = true;
s.token.noLoginNeeded = true;
s.register.noLoginNeeded = true;
s.login.noLoginNeeded = true;


module.exports = s;
