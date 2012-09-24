"use strict";
var logger = require("./logger.js").logger;
var step = require("Step");
var helper = require("./helper.js").helper;

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

	this.register = function () {
		//todo add register function.
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