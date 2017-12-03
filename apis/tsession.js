"use strict";

const step = require("step")
const h = require("whispeerHelper")
const Bluebird = require("bluebird")

const mailer = require("../includes/mailer")
const invites = require("../includes/invites")
const errorService = require("../includes/errorService")
const CompanyToken = require("../includes/models/companyToken")

var s = {
	logout: function logoutF(data, fn, request) {
		step(function () {
			if (data && data.logout === true) {
				request.session.logout(this);
			}
		}, fn);
	},
	token: function getToken(data, fn, request) {
		var myUser;

		step(function () {
			if (data && data.identifier) {
				var User = require("../includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, _myUser) {
			if (e) {
				errorService.handleError(e, request);
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				myUser = _myUser;
				myUser.getDisabled(request, this);
			}
		}, UserNotExisting), h.sF(function (isDisabled) {
			if (isDisabled) {
				fn.error({ userDisabled: true });
				this.last.ne();
			} else {
				this.parallel.unflatten();
				myUser.generateToken(this.parallel());
				myUser.getSalt(request, this.parallel());
			}
		}), h.sF(function (token, salt) {
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
			request.session.register(
				data.mail,
				data.nickname,
				data.password,
				data.keys,
				data.settings,
				data.signedKeys,
				data.signedOwnKeys,
				data.preID,
				request,
				this
			);
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
			invites.useCode(myUser, data.inviteCode, this.parallel().bind(this, null));
		}), h.sF(function () {
			if (data.token) {
				return CompanyToken.use(data.token, myUser.getID())
					.catch(errorService.criticalError)
					.thenReturn(res)
			}

			return Bluebird.resolve(res)
		}), fn);
	},
	login: function ({ identifier, password, token, companyToken }, fn, request) {
		step(() => {
			return request.session.login(request, identifier, password, token);
		}, h.sF(function (success) {
			const response = { login: success }

			if (companyToken) {
				return CompanyToken.use(companyToken, request.session.getUserID())
					.catch(errorService.criticalError)
					.thenReturn(response)
			}

			return Bluebird.resolve(response)
		}), fn);
	}
};

s.logout.noLoginNeeded = true;
s.token.noLoginNeeded = true;
s.register.noLoginNeeded = true;
s.login.noLoginNeeded = true;


module.exports = s;
