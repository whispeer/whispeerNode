"use strict";

var step = require("step");
var h = require("./includes/helper");

var whispeerAPI = {
	priorized: ["keyData"],
	logedin: function isLogedinF(data, fn, view) {
		step(function () {
			if (data === true) {
				view.logedin(this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (logedin) {
			this.ne(logedin);
		}), fn);
	},
	getKeyChain: function getKeyChainF(data, fn, view) {

	},
	getUser: function getUserF(data, fn, view) {

	},
	ownData: function getOwnDataF(data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getData(view, this);
		}), fn);
	},
	logout: function logoutF(data, fn, view) {
		step(function () {
			if (data && data.logout === true) {
				view.logout(this);
			}
		}, fn);
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
		var res;
		step(function () {
			view.getSession().register(data.mail, data.nickname, data.password, data.mainKey, data.signKey, data.cryptKey, view, this);
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

				if (data.profile.priv && data.profileKey) {
					myUser.createPrivateProfile(view, data.profileKey, data.profile.priv, this.parallel());
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

module.exports = whispeerAPI;