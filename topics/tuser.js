"use strict";

/* @refactor */

var step = require("step");
var h = require("whispeerHelper");

var Topic = require("../includes/topic.js");

var User = require("../includes/user");

var mailer = require("../includes/mailer");

var errorService = require("../includes/errorService");

function makeSearchUserData(request, cb, ids, known) {
	var remaining;
	step(function () {
		remaining = Math.max(ids.length - 20, 0);

		known = known || [];

		known = known.map(function (e) {
			return parseInt(e, 10);
		});

		var i;
		for (i = 0; i < Math.min(ids.length, 20); i += 1) {
			if (known.indexOf(parseInt(ids[i], 10)) === -1) {
				User.getUser(ids[i], this.parallel(), true);
			} else {
				this.parallel()(null, ids[i]);
			}
		}

		this.parallel()();
	}, h.sF(function (theUsers) {
		if (theUsers) {
			var i;
			for (i = 0; i < theUsers.length; i += 1) {
				if (theUsers[i] instanceof UserNotExisting) {
					this.parallel()({userNotExisting: true});
				} else if (typeof theUsers[i] === "object") {
					theUsers[i].getUData(request, this.parallel());
				} else {
					this.parallel()(null, theUsers[i]);
				}
			}
		} else {
			this.ne([]);
		}
	}), h.sF(function (users) {
		this.ne({
			remaining: remaining,
			results: users
		});
	}), cb);
}

var u = {
	get: function getUserF(data, fn, request) {
		step(function () {
			if (data && data.identifier) {
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, theUser) {
			if (e) {
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				theUser.getUData(request, this);
			}
		}, UserNotExisting), fn);
	},
	searchFriends: function searchFriends(data, fn, request) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.searchFriends(request, data.text, this);
		}), h.sF(function (ids) {
			makeSearchUserData(request, this, ids, data.known);
		}), fn);
		//TODO
	},
	changePassword: function (data, fn, request) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.changePassword(request, data.password, data.signedOwnKeys, data.decryptor, this);
		}), h.sF(function () {
			this.ne();
		}), fn);
	},
	search: function searchF(data, fn, request) {
		step(function () {
			User.search(data.text, this);
		}, h.sF(function (ids) {
			makeSearchUserData(request, this, ids, data.known);
		}), fn);
	},
	backupKey: function (data, fn, request) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.addBackupKey(request, data.decryptors, data.innerKey, this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	},
	getMultiple: function getAllF(data, fn, request) {
		step(function () {
			if (data && data.identifiers) {
				var i;
				for (i = 0; i < data.identifiers.length; i += 1) {
					User.getUser(data.identifiers[i], this.parallel(), true);
				}
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e, theUsers) {
			if (e) {
				errorService.handleError(e, request);
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				var i;
				for (i = 0; i < theUsers.length; i += 1) {
					if (theUsers[i] instanceof UserNotExisting) {
						errorService.handleError(theUsers[i]);
						this.parallel()({userNotExisting: true});
					} else {
						theUsers[i].getUData(request, this.parallel());
					}
				}
			}
		}, UserNotExisting), h.sF(function (users) {
			this.ne({
				users: users
			});
		}), fn);
	},
	profile: {
		update: function (data, fn, request) {
			var ownUser;
			step(function () {
				request.session.getOwnUser(this);
			}, h.sF(function (_ownUser) {
				ownUser = _ownUser;
				//delete all old profiles except me
				ownUser.deletePrivateProfilesExceptMine(request, this);
			}), h.sF(function () {
				//update me
				ownUser.setMyProfile(request, data.me, this.parallel());
				//set public profile
				ownUser.setPublicProfile(request, data.pub, this.parallel());
				//set private profiles
				data.priv.forEach(function (profile) {
					ownUser.createPrivateProfile(request, profile, this.parallel());
				}, this);
			}), h.sF(function () {
				this.ne({});
			}), fn);
		}
	},
	setMigrationState: function (data, fn, request) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.setMigrationState(request, data.migrationState, this);
		}), h.sF(function () {
			this.ne({
				success: true
			});
		}), fn);
	},
	mailChange: function (data, fn, request) {
		var ownUser;
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (_ownUser) {
			ownUser = _ownUser;
			ownUser.setMail(request, data.mail, this);
		}), h.sF(function () {
			mailer.sendAcceptMail(ownUser, this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	},
	donated: function (data, fn, request) {
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.donated(request, this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	},
	own: function getOwnDataF(data, fn, request) {
		var userData;
		step(function () {
			request.session.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getUData(request, this);
		}), h.sF(function (data) {
			userData = data;
			Topic.unreadCount(request, this);
		}), h.sF(function (unreadCount) {
			userData.unreadTopics = unreadCount;
			this.ne(userData);
		}), fn);
	}
};

module.exports = u;
