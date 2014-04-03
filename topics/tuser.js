"use strict";

/* @refactor */

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

function setPrivateProfiles(view, privateProfiles, cb) {
	step(function () {
		if (privateProfiles && privateProfiles.length > 0) {
			var i;
			for (i = 0; i < privateProfiles.length; i += 1) {
				Profile.get(view, privateProfiles[i].profileid, this.parallel());
			}
		} else {
			this.last.ne([]);
		}
	}, h.sF(function (profiles) {
		if (profiles.length !== privateProfiles.length) {
			throw "bug!";
		}

		var i;
		for (i = 0; i < privateProfiles.length; i += 1) {
			profiles[i].setData(view, privateProfiles[i], this.parallel());
		}
	}), h.sF(function (success) {
		this.ne(success);
	}), cb);
}

function setPublicProfile(view, publicProfile, cb) {
	step(function () {
		if (publicProfile) {
			view.getOwnUser(this);
		} else {
			this.last.ne(true);
		}
	}, h.sF(function (myUser) {
		myUser.setPublicProfile(view, publicProfile, this);
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
			if (typeof data.privateProfiles === "object" && data.privateProfiles instanceof Array) {
				for (i = 0; i < data.privateProfiles.length; i += 1) {
					myUser.createPrivateProfile(view, data.privateProfiles[i], this.parallel());
				}
			} else {
				fn.error.protocol();
			}

			this.parallel()();
		}), h.sF(function (results) {
			var result = {
				success: results
			};

			this.ne(result);
		}), fn);
	},
	deletePrivateProfiles: function deletePrivateProfilesF(data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (myUser) {
			if (typeof data.profilesToDelete === "object" && data.profilesToDelete instanceof Array) {
				var i;
				for (i = 0; i < data.profilesToDelete.length; i += 1) {
					myUser.deletePrivateProfile(view, data.profilesToDelete[i], this.parallel());
				}

				this.parallel()();
			} else {
				fn.error.protocol();
			}
		}), h.sF(function (results) {
			results = results || [];

			var result = {
				success: h.arrayToObject(results, function (e, i) {
					return data.profilesToDelete[i];
				})
			};

			this.ne(result);
		}), fn);
	},
	profileChange: function changeProfilesF(data, fn, view) {
		step(function () {
			if (!data) {
				this.last.ne({});
			}

			this.parallel.unflatten();

			setPublicProfile(view, data.pub, this.parallel());
			setPrivateProfiles(view, data.priv, this.parallel());
		}, h.sF(function (successPub, successPriv) {
			var allok = successPub;
			var errors = {
				pub: successPub,
				priv: []
			};

			successPriv.map(function (value, index) {
				if (!value) {
					allok = false;
					errors.priv.push(data.priv[index].id);
				}
			});

			this.ne({
				allok: allok,
				errors: errors
			});
		}), fn);
	},
	setMigrationState: function (data, fn, view) {
		step(function () {
			view.getOwnUser(this);
		}, h.sF(function (ownUser) {
			ownUser.setMigrationState(view, data.migrationState, this);
		}), h.sF(function () {
			this.ne({
				success: true
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