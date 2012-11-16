"use strict";
var logger = require("./logger.js").logger;
var step = require("step");
var helper = require("./helper.js").helper;
var h = helper;

var exceptions = require("./exceptions.js");
var InvalidMail = exceptions.InvalidMail;
var InvalidNickname = exceptions.InvalidNickname;

var Session = function () {
	/** how long is the session id */
	var SESSIONKEYLENGTH = 30;
	/** how long till automatic logout */
	var ONLINETIME = 10 * 60;
	/** session id, userid, are we loged in, time we logged in, stay forever? */
	var sid, userid = 0, logedin = false, time = 0, stay = 0;

	/** closure thingie */
	var theSession = this;

	/** get the current timestamp  (seconds)*/
	var timestamp = function () {
		return Math.floor(new Date().getTime() / 1000);
	};

	/** get the current timestamp  (seconds) - ONLINETIME*/
	var onlineTime = function () {
		return timestamp() - ONLINETIME;
	};

	/** get a session id
	* @param callback called with result (sid)
	* @callback	(err, sid) error and session id
	* @author Nilos
	*/
	var createSession = function (callback) {
		logger.log("Create Session!", logger.ALL);

		var tempSID;

		step(function generate() {
			helper.code(SESSIONKEYLENGTH, this);
		}, function (err, theSID) {
			if (err) { throw err; }
			logger.log("Generated SID:" + theSID, logger.NOTICE);

			tempSID = theSID;

			var stmt = "SELECT `id` FROM `session` WHERE sid = ?";
			require("./database.js").exec(stmt, [tempSID], this);
		}, function (err, results) {
			if (err) { throw err; }

			if (results.length > 0) {
				createSession(callback);
				return;
			}

			var stmt = "INSERT INTO `session` (`sid`, `userid`, `time`) VALUES (?, ?, ?)";
			require("./database.js").exec(stmt, [tempSID, userid, timestamp()], this);
		}, function (err) {
			if (err) {
				callback(err);
			} else {
				callback(null, tempSID);
			}
		});
	};

	/** check if already loged in
	* @return true/false if still loged in or not
	* @author Nilos
	* it might be that true is returned even if loged out on another tab/pc with the same session.
	* anyhow it will be turned to false shortly after.
	*/
	var checkLogin = function () {
		if (stay === 1) {
			return true;
		}

		if (time > onlineTime()) {
			var stmt = "Update `session` SET `time` = ? WHERE `sid` = ?";
			step(function () {
				require("./database.js").exec(stmt, [timestamp(), sid]);
			}, function (err, results) {
				if (err) {
					logger.log(err, logger.ERROR);
				}

				if (results.affectedRows === 0) {
					userid = 0;
					logedin = false;
					time = 0;
					stay = 0;
				}
			});
			return true;
		}

		return false;
	};

	/** login
	* @param identifier who wants to log in (mail or nickname)
	* @param password the users password (sha256)
	* @param callback called with results
	* @callback (err, loginSuccess) error if something went wrong, loginSuccess true/false if login ok.
	* @author Nilos
	*/
	this.login = function (identifier, password, callback) {
		logger.log("login! " + identifier + " - " + password, logger.ALL);
		step(function startQuery() {
			var stmt;
			var helper = require("./helper.js").helper;
			if (helper.isMail(identifier)) {
				stmt = "SELECT `id` FROM `user` WHERE `mail`=? AND `password`=? AND `password`!='';";
			} else if (helper.isNickname(identifier)) {
				stmt = "SELECT `id` FROM `user` WHERE `nickname`=? AND `password`=? AND `password`!='';";
			} else {
				callback(null, false);
				return;
			}
			require("./database.js").exec(stmt, [identifier, password], this);
		}, function queryResults(err, results) {
			if (err) {
				logger.log(err, logger.ERROR);
				callback(err, false);
			} else {
				if (results.length === 1) {
					userid = results[0].id;
					logger.log("Userid:" + userid, logger.NOTICE);
					createSession(this);
				} else {
					callback(null, false);
				}
			}

			return;
		}, function (err, theSID) {
			if (err) {
				callback(err, false);
			}

			sid = theSID;
			logedin = true;
			callback(null, true);
		});
	};

	/** get the users id
	* checks login in before
	* @author Nilos
	*/
	this.getUserID = function () {
		checkLogin();

		return userid;
	};

	this.getOwnUser = function (cb) {
		step(function checks() {
			checkLogin();

			if (userid > 0) {
				var userManager = require("./userManager.js");
				userManager.getUser(userid, this);
			}
		}, cb);
	};

	this.checkMail = function (cb, mail) {
		step(function starter() {
			if (!helper.isMail(mail)) {
				throw new InvalidMail(mail);
			}
		}, h.sF(function () {
			var stmt = "SELECT (EXISTS(Select 1 from `user` WHERE `mail` = ?)) as exists";
			require("./database.js").exec(stmt, [mail], this);
		}), h.sF(function (results) {
			this(null, results[0].exists === "1");
		}), cb);
	};

	this.checkNickname = function (cb, nickname) {
		step(function starter() {
			if (!helper.isNickname(nickname)) {
				throw new InvalidNickname(nickname);
			}
		}, h.sF(function () {
			var stmt = "SELECT (EXISTS(Select 1 from `user` WHERE `nickname` = ?)) as exists";
			require("./database.js").exec(stmt, [nickname], this);
		}), h.sF(function (results) {
			this(null, results[0].exists === "1");
		}), cb);
	};

	/** register a user.
	* @param mail users mail (compulsory or nickname)
	* @param nickname users nickname (compulsory or mail)
	* @param password users password (necessary if private key is given)
	* @param keys session keys (mainKey, wallKey, profilKey, etc.)
	* @param rsaKey rsa key. public key or private encrypted key.
	* profiles are added in an additional step with updatePublicProfile/privateProfile via UserManager
	* same goes for groups.
	*/
	this.register = function (cb, view, mail, nickname, password, keys, rsaKey) {
		//todo add register function.
		//y rule 1: nickname or mail! one can be empty. check for that!
		//y rule 2: session keys valid
		//y rule 3: session keys for main, profile, wall, share
		//y rule 4: valid rsa key. private key & Password or no private key and no password
		//y rule 5: vaild mail, valid nickname (includes empty in both cases check rule 1)
		//y rule 6: mail & nickname not in use (except if empty, than do not check)

		var userid;

		step(function sessionKeys() {
			var necessaryKeys = ["main", "wall", "share"];

			var i;
			for (i = 0; i < necessaryKeys.length; i += 1) {
				if (!helper.isSessionKey(keys[necessaryKeys[i]])) {
					view.addError("invalidSessionKey");
					view.addError(necessaryKeys[i] + "KeyInvalid");
				}
			}

		}, h.sF(function checkRSAKey() {
			if (!helper.isset(rsaKey) || !helper.isHex(rsaKey.n) || rsaKey.n.length < 256 || !helper.isHex(rsaKey.ee) || rsaKey.ee.length > 10) {
				view.addError("needPublicKey");
			}

			if (!helper.isPassword(password)) {
				if (helper.arraySet(rsaKey, "priv")) {
					view.addError("invalidPassword");
				}
			} else {
				if (!helper.arraySet(rsaKey, "priv")) {
					view.addError("needPrivateKey");
				}
			}

			if (helper.arraySet(rsaKey, "priv")) {
				if (!helper.isset(rsaKey.priv.ct) || !helper.isset(rsaKey.priv.iv) || rsaKey.priv.ct < 5 || rsaKey.priv.iv !== 34) {
					view.addError("invalidPrivateKey");
				}
			}

			this();
		}), h.sF(function nicknameORMail() {
			if (nickname === "") {
				nickname = null;
			}

			if (mail === "") {
				mail = null;
			}

			if (!helper.isset(nickname) && !helper.isset(mail)) {
				view.addError("needNicknameOrMail");
			}

			this();
		}), h.sF(function checkMail() {
			theSession.checkMail(this, mail);
		}), function isMail(err, validMail) {
			if (err) {
				if (err instanceof InvalidMail) {
					if (h.isset(mail) && mail !== "") {
						view.addError("invalidMail");
					}
				} else {
					throw err;
				}
			} else {
				if (!validMail) {
					view.addError("mailUsed");
				}
			}

			this();
		}, h.sF(function checkNickname() {
			theSession.checkNickname(nickname);
		}), function isNickname(err, validNickname) {
			if (err) {
				if (err instanceof InvalidNickname) {
					if (h.isset(nickname) && nickname !== "") {
						view.addError("invalidNickname");
					}
				} else {
					throw err;
				}
			} else {
				if (!validNickname) {
					view.addError("nicknameUsed");
				}
			}

			this();
		}, h.sF(function insertNoError() {
			if (!view.isError()) {
				//TODO: wall key here or in general for the walls?
				var stmt = "INSERT INTO `user` (`id`, `mail`, `nickname`, `password`, `mainKey`, `shareKey`) VALUES (NULL, ?, ?, ?, ?, ?);";
				require("./database.js").exec(stmt, [mail, nickname, password, keys.main], this.parallel());
			} else {
				view.error();
			}
		}), h.sF(function userAdded(result) {
			if (result.insertId > 0) {
				userid = result.insertId;
			} else {
				throw new Error("FATAL! inserted id <= 0 ... auto increment not set?");
			}

			//TODO!
			//insert rsa key
			//insert session keys
			//insert empty profiles

			var insertRSAKey = "";

			var insertEmptyPublicProfile = "Insert into `userprofiles` (`userid`) VALUES (?)";

			//think about restructuring groups and private profiles and private walls.
			var insertEmptyPrivateProfile = "";

			//get last insert id and save in userid
		}), cb);
	};

	/** set the session id
	* @param cb called with results
	* @param theSID session id to set to
	* @callback (err, logedin) err: something went wrong; logedin: session loged in.
	* @author Nilos
	*/
	this.setSID = function (cb, theSID) {
		step(function () {
			theSession.deleteOldSIDs(this);
		}, function (err) {
			if (err) { throw err; }
			sid = theSID;
			var stmt = "SELECT `stay`, `userid` FROM `session` WHERE `sid` = ?";
			require("./database.js").exec(stmt, [sid], this);
		}, function (err, results) {
			if (err) { throw err; }

			if (results.length === 0) {
				logedin = false;
				userid = 0;

				this(null, false);
			} else if (results.length === 1) {
				var result = results[0];
				userid = result.userid;
				logedin = true;
				time = timestamp();
				stay = result.stay;

				this(null, false);
			} else {
				logger.log("ERROR! Doubled Session!", logger.ERROR);

				this(null, false);
			}
		}, cb);
	};

	/** delete old sessions
	* @param cb called when done
	* @author Nilos
	*/
	this.deleteOldSIDs = function (cb) {
		step(function () {
			var stmt = "Delete FROM `session` WHERE `stay` = 0 and `time` < ?";
			var deleteTime = onlineTime();
			require("./database.js").exec(stmt, [deleteTime], this);
		}, cb);
	};

	/** get the session id */
	this.getSID = function () {
		return sid;
	};

	/** are we loged in */
	this.logedin = function () {
		checkLogin();

		return logedin;
	};

	/** logout
	* @param cb called when done
	* @callback (err) error if something went wrong.
	*/
	this.logout = function (cb) {
		var stmt = "DELETE FROM `session` WHERE `sid`=?;";

		step(function () {
			require("./database.js").exec(stmt, [sid], this);
		}, function (err) {
			if (err) {
				throw err;
			}

			logedin = false;
			userid = 0;
			sid = undefined;
			this(null);
		}, cb);
	};
};

module.exports = Session;