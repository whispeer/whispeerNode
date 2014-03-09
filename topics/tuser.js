"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Topic = require("../includes/topic.js");

var User = require("../includes/user");
var Profile = require("../includes/profile");

function makeSearchUserData(view, cb, ids, known) {
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
					theUsers[i].getUData(view, this.parallel());
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
	searchFriends: function searchFriends(data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.searchFriends(view, data.text, this);
		}), h.sF(function (ids) {
			makeSearchUserData(view, this, ids, data.known);
		}), fn);
		//TODO
	},
	search: function searchF(data, fn, view) {
		step(function () {
			User.search(data.text, this);
		}, h.sF(function (ids) {
			makeSearchUserData(view, this, ids, data.known);
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
	createPrivateProfiles: function createProfileF(data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (myUser) {
			var i;
			for (i = 0; i < data.privateProfiles.length; i += 1) {
				myUser.createPrivateProfile(view, data.privateProfiles[i], this.parallel());
			}

			this.parallel()();
		}), h.sF(function (results) {
			result = {
				success: results
			};
		}), fn);
	},
	deletePrivateProfiles: function deletePrivateProfilesF(data, fn, view) {
		step(function () {
			view.getOwnUser(this);	
		}, h.sF(function (myUser) {
			var i;
			for (i = 0; i < data.profilesToDelete.length; i += 1) {
				myUser.deletePrivateProfile(view, data.profilesToDelete[i], this.parallel());
			}

			this.parallel()();
		}), h.sF(function (results) {
			result = {
				success: h.arrayToObject(results, function (e, i) {
					return data.profilesToDelete[i];
				})
			};
		}), fn);
	},
	profileChange: function changeProfilesF(data, fn, view) {
		var myUser;
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (user) {
			myUser = user;
			if (data.priv) {
				var i;
				for (i = 0; i < data.priv.length; i += 1) {
					Profile.get(view, data.priv[i].profileid, this.parallel());
				}
			}
		}), h.sF(function (privateProfiles) {
			if (data.pub) {
				myUser.setPublicProfile(view, data.pub, this.parallel());
			} else {
				this.parallel()(null, true);
			}

			if (privateProfiles.length !== data.priv.length) {
				throw "bug!";
			}

			var i, cur;
			for (i = 0; i < privateProfiles.length; i += 1) {
				cur = data.priv[i];
				privateProfiles[i].setData(view, cur, this.parallel());
			}
		}), h.sF(function (result) {
			var i, allok = result[0], errors = {
				pub: result[0],
				priv: []
			};

			for (i = 1; i < result.length; i += 1) {
				if (!result[i]) {
					allok = false;
					errors.priv.push(data.priv[i].id);
				}
			}

			this.ne({
				allok: allok,
				errors: errors
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