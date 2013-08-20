"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Topic = require("../includes/topic.js");

var User = require("../includes/user");

var u = {
	get: function getUserF(data, fn, view) {
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
				theUser.getUData(view, this);
			}
		}, UserNotExisting), fn);
	},
	search: function searchF(data, fn, view) {
		var remaining = 0;
		step(function () {
			User.search(data.text, this);
		}, h.sF(function (ids) {
			remaining = Math.max(ids.length - 20, 0);

			var known = data.known || [];

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
		}), h.sF(function (theUsers) {
			var i;
			for (i = 0; i < theUsers.length; i += 1) {
				if (theUsers[i] instanceof UserNotExisting) {
					this.parallel()({userNotExisting: true});
				} else if (typeof theUsers[i] === "object") {
					theUsers[i].getUData(view, this.parallel());
				} else {
					this.parallel()(null, theUsers[i]);
				}
			}
		}), h.sF(function (users) {
			this.ne({
				remaining: remaining,
				results: users
			});
		}), fn);
	},
	getMultiple: function getAllF(data, fn, view) {
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
				fn.error({userNotExisting: true});
				this.last.ne();
			} else {
				var i;
				for (i = 0; i < theUsers.length; i += 1) {
					if (theUsers[i] instanceof UserNotExisting) {
						this.parallel()({userNotExisting: true});
					} else {
						theUsers[i].getUData(view, this.parallel());
					}
				}
			}
		}, UserNotExisting), h.sF(function (users) {
			this.ne({
				users: users
			});
		}), fn);
	},
	own: function getOwnDataF(data, fn, view) {
		var userData;
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getUData(view, this);
		}), h.sF(function (data) {
			userData = data;
			Topic.unreadCount(view, this);
		}), h.sF(function (unreadCount) {
			userData.unreadTopics = unreadCount;
			this.ne(userData);
		}), fn);
	}
};

module.exports = u;