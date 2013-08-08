"use strict";

var step = require("step");
var h = require("whispeerHelper");

var u = {
	get: function getUserF(data, fn, view) {
		step(function () {
			if (data && data.identifier) {
				var User = require("../includes/user");
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
	getMultiple: function getAllF(data, fn, view) {
		step(function () {
			if (data && data.identifiers) {
				var i;
				for (i = 0; i < data.identifiers.length; i += 1) {
					var User = require("../includes/user");
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
				for (i = 0; i < theUsers; i += 1) {
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
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.getUData(view, this);
		}), fn);
	}
};

module.exports = u;