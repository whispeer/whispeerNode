"use strict";

var helper = require("./helper.js").helper;
var logger = require("./logger.js").logger;
var step = require("Step");

var exceptions = require("./exceptions.js");
var UserNotExisting = exceptions.UserNotExisting;
var AccessException = exceptions.AccessException;
var InvalidSignature = exceptions.InvalidSignature;
var InvalidSymKey = exceptions.InvalidSymKey;

var ssnH = helper;
var h = helper;

var UserManager = function () {
	this.validAttributes = {"firstname": true, "lastname": true};

	var KEEPTIME = 10 * 60 * 1000;

	var usersID = {};
	var usersMail = {};
	var usersNickname = {};
	var usedTimes = {};

	this.reset = function () {
		usersID = {};
		usersMail = {};
		usersNickname = {};
		usedTimes = {};
	};

	var User = function (identifier) {
		var theUser = this;
		var that = this;

		var loaded;
		var loadListener = [];

		var userid;
		var nickname;
		var mail;

		var mainKey;

		var friends;
		var friendShipRequests;

		var clients = {};

		/** keytypes for a user. Wall for wall, profile for profile and share to share stuff */
		//var userKeys = ["wall", "profile", "share"];

		var publicProfile;
		var profiles;

		/** the users public key */
		var publicKey;

		/** the users private key */
		var privateKey;

		this.addClient = function (view) {
			if (typeof clients[view.getClient().getClientID()] === "undefined") {
				clients[view.getClient().getClientID()] = view.getClient();
			}
		};

		this.removeClient = function (view) {
			delete clients[view.getClient().getClientID()];
		};

		/** is this user the active user
		* @param view requesters view. necessary to determine logged in userid
		* @author Nilos
		* this is only used internally, because externally you need a callback.
		*/
		var ownUser = function (view) {
			return parseInt(view.getUserID(), 10) === parseInt(userid, 10);
		};

		this.ownUser = function (cb, view) {
			cb(ownUser(view));
		};

		this.getUserID = function (cb) {
			cb(null, userid);
		};

		this.getMail = function (cb, overwrite) {
			if (!helper.isset(mail) || overwrite === true) {
				var stmt = "SELECT `mail` from `user` WHERE `ID` = ?";

				step(function getMail() {
					require("./database.js").exec(stmt, [userid], this);
				}, function theMail(err, results) {
					if (err) {
						cb(err);
					} else {
						mail = results[0].mail;
						cb(null, mail);
					}
				});
			} else {
				cb(null, mail);
			}
		};

		this.getNickname = function (cb, overwrite) {
			if (!helper.isset(nickname) || overwrite === true) {
				var stmt = "SELECT `nickname` from `user` WHERE `ID` = ?";

				step(function getNickname() {
					require("./database.js").exec(stmt, [userid], this);
				}, function theNickname(err, results) {
					if (err) {
						cb(err);
					} else {
						nickname = results[0].nickname;
						cb(null, nickname);
					}
				});
			} else {
				cb(null, nickname);
			}
		};

		/** get the main encryption key of this user
		* @param cb called with result
		* @param view used to determine if current user = this user
		* @param overwrite load from database anyhow.
		* @callback main key (hex encoded)
		*/
		this.getMainKey = function (cb, view, overwrite) {
			if (ownUser(view)) {
				if (!helper.isset(mainKey) || overwrite === true) {
					var stmt = "SELECT `mainKey` from `user` WHERE `id` = ? LIMIT 1";

					step(function getMainKey() {
						require("./database.js").exec(stmt, [view.getUserID()], this);
					}, function theMainKey(err, results) {
						if (err) {
							cb(err);
						} else {
							var mainKey = results[0].mainKey;
							cb(null, mainKey);
						}
					});
				} else {
					cb(null, mainKey);
				}
			} else {
				cb(new AccessException("not own user"));
			}
		};

		/** get the public key
		* @author Nilos
		* @created 22-08-2012
		* @param cb callback
		* @param overwrite whether to definitly reload the public key from database
		* @callback publicKey with n and ee and id as object.
		*/
		this.getPublicKey = function (cb, overwrite) {
			if (!helper.isset(publicKey) || overwrite === true) {
				var stmt = "SELECT `n`, `ee` from `rsakeys` WHERE `userid` = ? and `type` = 0";

				step(function getPublicKey() {
					require("./database.js").exec(stmt, [userid], this);
				}, function thePublicKey(err, results) {
					if (err) {
						cb(err);
					} else {
						var n = results[0].n;
						var ee = results[0].ee;
						publicKey = {
							n: n,
							ee: ee,
							id: userid
						};

						cb(null, publicKey);
					}
				});
			} else {
				cb(null, publicKey);
			}
		};

		/** get the private key of this user
		* @param cb called with result
		* @param view current view used to determine if current user = this user
		* @param overwrite load from datbase anyway
		* @callback private key data object.
		* @author Nilos
		*/
		this.getPrivateKey = function (cb, view, overwrite) {
			if (ownUser(view)) {
				if (!helper.isset(privateKey) || overwrite === true) {
					var stmt = "SELECT `n`, `ee`, `iv`, `salt`, `ct` from `rsakeys` WHERE `userid` = ? and `type` = 0";

					step(function getPrivateKey() {
						require("./database.js").exec(stmt, [userid], this);
					}, h.sF(function thePublicKey(results) {
						var n = results[0].n;
						var ee = results[0].ee;
						var iv = ssnH.hexToBase64(results[0].iv);
						var salt = ssnH.hexToBase64(results[0].salt);
						var ct = ssnH.hexToBase64(results[0].ct);
						privateKey = {
							n: n,
							ee: ee,
							id: userid,
							priv: {
								iv: iv,
								salt: salt,
								ct: ct
							}
						};

						this(null, privateKey);
					}), cb);
				} else {
					cb(null, privateKey);
				}
			} else {
				cb(new AccessException("Not own User."));
			}
		};

		this.getSessionKeys = function (cb, view) {
			if (ownUser(view)) {
				var profilKeys = {};
				step(function areFriends() {
					theUser.isFriend(this, view);
				}, h.sF(function areFriendsR(result) {
					if (result === true) {
						var stmt = "Select " +
							"`group`, `key`, `keySym`, `keySymIV` " +
							"from `userprofiles_e` " +
							"WHERE `userid` = ?";
						require("./database.js").exec(stmt, [userid], this);
					} else {
						throw new AccessException("not friends");
					}
				}), h.sF(function keyMResults(results) {
					var i = 0;
					for (i = 0; i < results.length; i += 1) {
						var cur = results[i];
						profilKeys[cur.group] = (cur.keySym === null ? cur.key : {"iv": cur.keySymIV, "ct": cur.keySym});
					}

					var stmt = "Select " +
						"`wallKey`, `wallKeySym`, `wallKeySymIV`, `shareKey`, `shareKeySym`, `shareKeySymIV` " +
						"from `user` " +
						"WHERE `id` = ? Limit 1";
					require("./database.js").exec(stmt, [userid], this);
				}), h.sF(function keyWResults(results) {
					var cur = results[0];

					var keys = {};
					keys.profile = profilKeys;
					keys.wall = (cur.wallKeySym === null ? cur.wallKey : {"iv": cur.wallKeySymIV, "ct": cur.wallKeySym});
					keys.share = (cur.shareKeySym === null ? cur.shareKey : {"iv": cur.shareKeySymIV, "ct": cur.shareKeySym});

					this(null, keys);
				}), cb);
			} else {
				step(function areFriends() {
					theUser.isFriend(this, view);
				}, h.sF(function areFriendsR(result) {
					if (result === true) {
						var stmt = "Select " +
							"`profilKey`, `profilKeySym`, `profilKeySymIV`, " +
							"`wallKey`, `wallKeySym`, `wallKeySymIV`, " +
							"`shareKey`, `shareKeySym`, `shareKeySymIV` " +
							"from `friends` WHERE `userid` = ? and `friendid` = ?";
						require("./database.js").exec(stmt, [view.getUserID(), userid], this);
					} else {
						throw new AccessException("not friends");
					}
				}), h.sF(function keyMResults(results) {
					if (results.length === 1) {
						var cur = results[0];
						var keys = {};
						keys.profile = (cur.profilKeySym === null ? cur.profilKey : {"iv": cur.profilKeySymIV, "ct": cur.profilKeySym});
						keys.wall = (cur.wallKeySym === null ? cur.wallKey : {"iv": cur.wallKeySymIV, "ct": cur.wallKeySym});
						keys.share = (cur.shareKeySym === null ? cur.shareKey : {"iv": cur.shareKeySymIV, "ct": cur.shareKeySym});

						this(null, keys);
					} else {
						this(null, null);
					}
				}), cb);
			}
		};

		this.getObject = function (cb, view, scheme) {
			var result = {};
			if (ownUser(view) === true) {
				step(function getPublicProfile() {
					theUser.getPublicProfile(this, scheme);
				}, h.sF(function thePublicProfile(data) {
					result.publicProfile = data;
					theUser.getProfiles(this, view, scheme);
				}), h.sF(function thePrivateProfiles(data) {
					result.profiles = data;
					theUser.getSessionKeys(this, view);
				}), h.sF(function theKeys(data) {
					result.keys = data;

					this(null, result);
				}), cb);
			} else {
				step(function getPublicProfile() {
					theUser.getPublicProfile(this, scheme);
				}, h.sF(function thePublicProfile(data) {
					result.publicProfile = data;
					theUser.getProfile(this, view, scheme);
				}), h.sF(function thePrivateProfiles(data) {
					if (h.isset(data)) {
						result.profiles = data;
					}

					theUser.getSessionKeys(this, view);
				}), h.sF(function theKeys(data) {
					result.keys = data;

					this(null, result);
				}), cb);
			}
		};

		var filterScheme = function (profileData, scheme) {
			return profileData;
		};

		var loadProfiles = function (cb, overwrite) {
			if (h.isset(profiles) && !overwrite) {
				cb();
			} else {
				step(function profileEncryptedDB() {
					var stmt = "SELECT `group`, `sig`, `iv`, `firstName`, `lastName` FROM `userprofiles_e` WHERE `userid` = ?";
					require("./database.js").exec(stmt, [userid], this);
				}, h.sF(function profileEncryptedResult(results) {
					profiles = {};

					var i = 0;
					for (i = 0; i < results.length; i += 1) {
						var cur = results[i];
						profiles[cur.group] = {};
						profiles[cur.group].sig = cur.sig;
						profiles[cur.group].iv = cur.iv;
						profiles[cur.group].firstName = cur.firstName;
						profiles[cur.group].lastName = cur.lastName;
					}

					this(null);
				}), cb);
			}
		};

		var getProfileByGroup = function (cb, group, scheme) {
			step(function starter() {
				loadProfiles(this);
			}, h.sF(function profilesLoaded() {
				if (h.isset(profiles[group])) {
					this(null, filterScheme(profiles[group], scheme));
				} else {
					this(new AccessException("profile not existing"));
				}
			}), cb);
		};

		this.getProfiles = function (cb, view, scheme) {
			step(function loader() {
				if (ownUser(view)) {
					loadProfiles(this);
				} else {
					throw new AccessException("not own user");
				}
			}, h.sF(function profilesLoaded() {
				this(null, filterScheme(profiles, scheme));
			}), cb);
		};

		this.getProfile = function (cb, view, scheme) {
			step(function fGroup() {
				theUser.friendGroup(this, view.getSession().getUserID());
			}, h.sF(function getData(group) {
				getProfileByGroup(this, group, scheme);
			}), cb);
		};

		this.getOwnProfile = function (cb, view, group, scheme) {
			step(function ownUser() {
				if (ownUser(view)) {
					getProfileByGroup(this, group, scheme);
				} else {
					throw new AccessException("not own user");
				}
			}, cb);
		};

		this.getPublicProfile = function (cb, scheme) {
			if (h.isset(publicProfile)) {
				cb(null, publicProfile);
			} else {
				step(function profileEncryptedDB() {
					var stmt = "SELECT `sig`, `firstName`, `lastName` FROM `userprofiles` WHERE `userid` = ?";
					require("./database.js").exec(stmt, [userid], this);
				}, h.sF(function profileEncryptedResult(results) {
					if (results.length !== 1) {
						throw new Error("not exactly one publicprofile per user" + userid + " - " + results.length);
					}

					var cur = results[0];
					publicProfile = {};
					publicProfile.sig = cur.sig;
					publicProfile.firstName = cur.firstName;
					publicProfile.lastName = cur.lastName;

					this(null, filterScheme(publicProfile, scheme));
				}), cb);
			}
		};

		this.setProfile = function (cb, view, group, data) {
			step(function ownUser() {
				if (ownUser(view)) {
					if (h.isSig(data.sig)) {
						if (h.isInt(group) && group > 0) {
							//TODO
						} else {
							cb(null, false);
						}
					} else {
						cb(null, false);
					}
				} else {
					throw new AccessException("not own user");
				}
			});
		};

		this.setPublicProfile = function (cb, view, data) {
			step(function ownUser() {
				if (ownUser(view)) {
					if (h.isSig(data.sig)) {
						//TODO
					} else {
						cb(null, false);
					}
				} else {
					throw new AccessException("not own user");
				}
			});
		};

		this.friends = function (cb, overwrite) {
			step(function getFriendsAndGroups() {
				theUser.friendsAndGroups(this, overwrite);
			}, h.sF(function theFriendsAndGroups(friends) {
				var friend;
				var result = [];

				for (friend in friends) {
					if (friends.hasOwnProperty(friend)) {
						result.push(friend);
					}
				}

				this(null, result);
			}), cb);
		};

		this.friendGroup = function (cb, userid, overwrite) {
			step(function getFriendsAndGroups() {
				theUser.friendsAndGroups(this, overwrite);
			}, h.sF(function theFriendsAndGroups(friends) {
				this(null, friends[userid]);
			}), cb);
		};

		this.friendsAndGroups = function (cb, overwrite) {
			if (!helper.isset(friends) || overwrite === true) {
				step(function () {
					var stmt = "Select f1.`friendid`, f1.`group` from `friends` as f1, `friends` as f2 WHERE f1.`userid` = ? and f2.`userid` = f1.`friendid` and f2.`friendid` = ?";
					require("./database.js").exec(stmt, [userid, userid], this);
				}, h.sF(function friendsResult(results) {
					friends = {};
					var i = 0;
					for (i = 0; i < results.length; i += 1) {
						friends[results[i].friendid] = results[i].groupid;
					}

					this(null, friends);
				}), cb);
			} else {
				cb(null, friends);
			}
		};

		this.hasFriend = function (cb, userid) {
			step(function () {
				theUser.friends(this, false);
			}, function theFriends(err, friends) {
				if (err) { throw err; }

				if (helper.isset(friends[userid])) {
					this(null, true);
				} else {
					this(null, false);
				}
			}, cb);
		};

		this.isFriend = function (cb, view) {
			theUser.hasFriend(cb, view.getUserID());
		};

		this.usersFriendShipRequests = function (cb, overwrite) {
			if (!helper.isset(friendShipRequests) || overwrite === true) {
				step(function getFSR() {
					var stmt = "Select `friendid` FROM `friends` WHERE `userid` = ? and `friendid` NOT IN (Select `userid` from `friends` WHERE `friendid` = ?)";
					require("./database.js").exec(stmt, [userid, userid], this);
				}, function theFSR(err, results) {
					if (err) { throw err; }

					friendShipRequests = [];
					var i = 0;
					for (i = 0; i < results.length; i += 1) {
						friendShipRequests.push(results[i].friendid);
					}

					this(null, friendShipRequests);
				}, cb);
			} else {
				cb(null, friendShipRequests);
			}
		};

		this.hasFriendShipRequested = function (cb, view, theUserID) {
			step(function getFSR() {
				theUser.usersFriendShipRequests(this, false);
			}, function theFSR(err, fsr) {
				if (err) { throw err; }
				if (ssnH.isset(theUserID) && theUserID !== view.getUserID()) {
					if (ownUser(view)) {
						if (ssnH.inArray(fsr, theUserID)) {
							this(null, true);
						} else {
							this(null, false);
						}
					} else {
						throw new AccessException("can not get friendshiprequests for other users");
					}
				} else {
					if (ssnH.inArray(fsr, view.getUserID())) {
						this(null, true);
					} else {
						this(null, false);
					}
				}
			}, cb);
		};

		this.didIRequestFriendShip = function (cb, view) {
			step(function getOwnUser() {
				view.getSession().getOwnUser(this);
			}, function ownUser(u) {
				u.hasFriendShipRequested(this, view, userid);
			}, cb);
		};

		this.friendShip = function (cb, view, keys, sig, token, group) {
			var theOwnUser;
			step(function startFriendShip() {
				if (!h.isInt(group) || group < 1) {
					group = 1;
				}

				if (view.getSession().checkLogin() !== true) {
					throw new AccessException("not logged in any more");
				}

				theUser.didIRequestFriendShip(this, view);
			}, h.sF(function (alreadyFriends) {
				if (alreadyFriends) {
					cb(null, true);
				} else {
					if (h.isSig(sig)) {
						view.getOwnUser(this);
					} else {
						throw new InvalidSignature("not a signature.");
					}
				}
			}), h.sF(function (ownUser) {
				theOwnUser = ownUser;
				theOwnUser.checkToken(this, view, token, "friendShip");
			}), h.sF(function (tokenOK) {
				if (tokenOK !== true) {
					throw new InvalidSignature("friendShip not correctly signed.");
				}

				theOwnUser.checkSignature(sig, "friendShip|" + userid + "|" + token, this);
			}), h.sF(function (sigOK) {
				if (!sigOK) {
					throw new InvalidSignature("friendShip not correctly signed.");
				}

				if (h.isSymKey(keys.profile) !== true) {
					throw new InvalidSymKey("profile");
				}

				if (h.isSymKey(keys.wall) !== true) {
					throw new InvalidSymKey("wall");
				}

				var stmt = "Insert INTO `friends` (`userid`, `friendid`, `group`, `profilKey`, `wallKey`) VALUES (?, ?, ?, ?, ?)";
				//check keys
			}));

			//TODO
		};

		this.unfriend = function (cb) {
			//TODO
		};

		this.checkSignature = function (signature, message, callback) {
			//TODO
		};

		this.checkToken = function (cb, view, token, topic) {
			step(function () {
				if (ownUser(view)) {
					//TODO
					//select from db, etc.
				} else {
					throw new AccessException("not own user");
				}
			}, cb);
		};

		this.addLoadListener = function (toCall) {
			if (loaded) {
				toCall();
			} else {
				loadListener.push(toCall);
			}
		};

		var isLoaded = function (exists) {
			that.loaded = true;
			var i = 0;
			for (i = 0; i < loadListener.length; i += 1) {
				if (typeof loadListener[i] === "function") {
					loadListener[i](exists);
				}
			}
		};

		var stmt;
		if (helper.isID(identifier)) {
			stmt = "SELECT `ID`, `nickname`, `mail`, `mainKey` from `user` WHERE `ID` = ?";
		} else if (helper.isNickname(identifier)) {
			stmt = "SELECT `ID`, `nickname`, `mail`, `mainKey` from `user` WHERE `nickname` = ?";
		} else if (helper.isMail(identifier)) {
			stmt = "SELECT `ID`, `nickname`, `mail`, `mainKey` from `user` WHERE `mail` = ?";
		} else {
			isLoaded(false);
			return;
		}

		step(function queryUserDetails() {
			require("./database.js").exec(stmt, [identifier], this);
		}, function resultUserDetails(err, results) {
			if (err) {
				isLoaded(false);
			}

			if (results.length === 1) {
				userid = results[0].ID;
				nickname = results[0].nickname;
				mail = results[0].mail;
				mainKey = results[0].mainKey;
				isLoaded(true);
			} else {
				isLoaded(false);
			}
		});
	};

	/** Container der ein Userobjekt managed.
	* @author Nilos
	* @created 22-08-2012
	* @object
	* @param identifier identifier of the user
	* @param callback function to call if user is loaded.
	*/
	var Container = function (identifier, callback) {
		var that = this;
		var theUser;
		var userid;

		this.isLoaded = function () {
			if (theUser) {
				var lastUsed = usedTimes[userid];
				if (new Date().getTime() - lastUsed <= KEEPTIME) {
					return true;
				}

				logger.log("delete user from memory: " + userid + " - " + (new Date().getTime() - lastUsed), logger.ALL);

				delete usersID[userid];

				step(function getMail() {
					theUser.getMail(this);
				}, function (err, m) {
					if (err) { throw err; }
					if (helper.isset(m)) {
						delete usersMail[m];
					}

					theUser.getNickname(this);
				}, function (err, n) {
					if (err) { logger.log(err, logger.ERROR); }
					if (helper.isset(n)) {
						delete usersNickname[n];
					}

					theUser = null;
				});
			}

			return false;
		};

		/** Create A Mapper for a user object function
		@param theProperty property of the user object to create a mapper for in this container object
		@author Nilos
		@created 22-08-2012
		*/
		var createMapper = function (theProperty) {
			return function (callback) {
				logger.log("user GET: " + theProperty);
				if (that.isLoaded()) {
					usedTimes[userid] = new Date().getTime();
					return theUser[theProperty].apply(theUser, arguments);
				}

				//delete theUser so it can be freed in memory.
				theUser = null;

				if (typeof callback !== "function") {
					logger.log("Warning: Calling User Function without a callback", logger.WARNING);
				}

				//get user object from userManager
				//seems to work ...
				step(function getUser() {
					UserManager.getUser(identifier, this);
				}, function theUser(u) {
					u[theProperty].apply(null, arguments);
				});

			};
		};

		step(function loadUser() {
			theUser = new User(identifier);

			var property;
			for (property in theUser) {
				if (theUser.hasOwnProperty(property)) {
					if (typeof theUser[property] === "function") {
						that[property] = createMapper(property);
					}
				}
			}

			theUser.addLoadListener(this);
		}, function userLoaded(exists) {
			if (exists === true) {
				theUser.getUserID(this);
			} else {
				callback(null, false);
			}
		}, function userID(err, id) {
			if (err) { throw err; }

			userid = id;
			usersID[id] = that;
			usedTimes[id] = new Date().getTime();

			theUser.getMail(this);
		}, function userMail(err, mail) {
			if (err) { throw err; }
			if (helper.isset(mail)) {
				usersMail[mail] = that;
			}
			theUser.getNickname(this);
		}, function userNickname(err, nickname) {
			if (err) {
				logger.log(err, logger.ERROR);
				throw err;
			} else {
				if (helper.isset(nickname)) {
					usersNickname[nickname] = that;
				}

				callback(null, true);
			}
		});
	}; /* End Container */

	/** Get an already loaded user from arrays */
	var umGetLoadedUser = function (identifier) {
		if (helper.isID(identifier)) {
			return usersID[identifier];
		}

		if (helper.isMail(identifier)) {
			return usersMail[identifier];
		}

		if (helper.isNickname(identifier)) {
			return usersNickname[identifier];
		}

		return false;
	};

	/** Load one user.
	* identifier: identifier of user.
	* scheme: "scheme"
	* callback: function to call when user is loaded
	**/
	var umGetUser = function (identifier, callback) {
		logger.log("Loading user: " + identifier, logger.NOTICE);
		if (this.userLoaded(identifier)) {
			callback(null, umGetLoadedUser(identifier));
		} else {
			var element;
			step(function createC() {
				element = new Container(identifier, this);
			}, function theC(err, exists) {
				if (err) {
					callback(err);
				}
				logger.log("user loaded: " + identifier, logger.NOTICE);
				if (exists) {
					callback(null, element);
				} else {
					callback(new UserNotExisting(), null);
				}
			});
		}
	};

	/** is a user already loaded
	* @param identifier user identifier (mail, id, nickname)
	* @author Nilos
	*/
	var umUserLoaded = function (identifier) {
		if (helper.isID(identifier)) {
			return typeof usersID[identifier] === "object" && usersID[identifier] instanceof Container && usersID[identifier].isLoaded();
		}

		if (helper.isMail(identifier)) {
			return typeof usersMail[identifier] === "object" && usersMail[identifier] instanceof Container && usersMail[identifier].isLoaded();
		}

		if (helper.isNickname(identifier)) {
			return typeof usersNickname[identifier] === "object" && usersNickname[identifier] instanceof Container && usersNickname[identifier].isLoaded();
		}

		return false;
	};

	this.search = function (search, callback) {
		var searchResults = [];

		step(function getByIDNickMail() {
			var stmt;
			if (h.isID(search)) {
				stmt = "SELECT `id` FROM `user` WHERE `ID` = ? LIMIT 1";
			} else if (h.isNickname(search)) {
				stmt = "SELECT `id` FROM `user` WHERE `nickname` LIKE ? LIMIT 1";
			} else if (h.isMail(search)) {
				stmt = "SELECT `id` FROM `user` WHERE `mail` = ? LIMIT 1";
			}

			if (stmt) {
				require("./database.js").exec(stmt, [search], this);
			} else {
				this(null);
			}
		}, h.sF(function (result) {
			if (result) {
				searchResults.push(result[0].id);
			}

			var stmt = "SELECT `userid` FROM `userprofiles` WHERE MATCH (`firstName`,`lastName`) AGAINST (? IN BOOLEAN MODE) Limit 30";
			require("./database.js").exec(stmt, [search], this);
		}), h.sF(function (result) {
			var i = 0;
			for (i = 0; i < result.length; i += 1) {
				searchResults.push(result[i].userid);
			}

			this(null, searchResults);
		}), callback);
	};

	this.userObject = function (obj) {
		return obj instanceof Container;
	};

	this.getUser = umGetUser;
	this.userLoaded = umUserLoaded;
};

UserManager = new UserManager();

module.exports = UserManager;