"use strict";

var step = require("step");
var h = require("./helper");
var client = require("./client");

var SymKey = require("./crypto/symKey.js");
var CryptKey = require("./crypto/signKey.js");
var SignKey = require("./crypto/cryptKey.js");

require("./errors");

/** how long is the session id */
var SESSIONKEYLENGTH = 30;

/** how long till automatic logout */
var ONLINETIME = 10 * 60;

/** recheck online status every 10 seconds */
var CHECKTIME = 10 * 1000;

var Session = function Session() {

	/** session id, userid, are we loged in, time we logged in, stay forever? */
	var sid, userid = 0, logedin = false, lastChecked = 0, sessionUser;

	/** get a session id
	* @param callback called with result (sid)
	* @callback	(err, sid) error and session id
	* @author Nilos
	*/
	function createSession(id, callback) {
		console.log("Create Session!");

		var tempSID;

		step(function generate() {
			h.code(SESSIONKEYLENGTH, this);
		}, h.sF(function (theSID) {
			console.log("Generated SID:" + theSID);

			tempSID = theSID;

			client.setnx("session:" + tempSID, id, this);
		}), h.sF(function (set) {
			if (set === 1) {
				this.ne(tempSID);
			} else {
				createSession(this.last);
				return;
			}
		}), callback);
	}

	function time() {
		return new Date().getTime();
	}

	/** check if already loged in
	* @callback true/false if still loged in or not
	* @author Nilos
	* it might be that true is returned even if loged out on another tab/pc with the same session.
	* anyhow it will be turned to false shortly after.
	*/
	function checkLogin(cb) {
		step(function () {
			if (logedin === true) {
				if (CHECKTIME < time() - lastChecked) {
					client.get("session:" + sid, this);
				} else {
					this.last.ne(true);
				}
			} else {
				this.last.ne(false);
			}
		}, h.sF(function (id) {
			lastChecked = time();
			if (id !== userid) {
				this.ne(false);
			} else {
				this.ne(true);
			}
		}), cb);
	}

	function checkLoginError(cb) {
		step(function () {
			this.logedin(this);
		}, h.sF(function (logedin) {
			if (!logedin) {
				throw new NotLogedin();
			} else {
				this.ne();
			}
		}), cb);
	}

	this.logedin = checkLogin;
	this.logedinError = checkLoginError;

	/** set the session id
	* @param cb called with results
	* @param theSID session id to set to
	* @callback (err, logedin) err: something went wrong; logedin: session loged in.
	* @author Nilos
	*/
	this.setSID = function (theSID, cb) {
		step(function () {
			lastChecked = time();
			client.get(theSID, this);
		}, h.sF(function (results) {
			if (results && h.isID(results)) {
				userid = results;
				this.last.ne(true);
			} else {
				this.last.ne(false);
			}
		}), cb);
	};

	/** get the session id */
	this.getSID = function () {
		return sid;
	};

	/** logout
	* @param cb called when done
	* @callback (err) error if something went wrong.
	*/
	this.logout = function (cb) {
		step(function () {
			logedin = false;
			userid = 0;
			sid = undefined;
			client.del("session:" + sid, this);
		}, cb);
	};

	/** login
	* @param identifier who wants to log in (mail or nickname)
	* @param password the users password (sha256)
	* @param callback called with results
	* @callback (err, loginSuccess) error if something went wrong, loginSuccess true/false if login ok.
	* @author Nilos
	*/
	this.login = function loginF(identifier, password, cb) {
		var myUser;
		//TODO
		step(function () {
			var User = require("./user.js");
			User.getUser(identifier, this);
		}, h.sF(function (user) {
			myUser = user;
			myUser.getPassword(this);
		}), h.sF(function (pw) {
			if (password === pw) {
				createSession(myUser.getID(), this);
			} else {
				throw new InvalidLogin();
			}
		}), h.sF(function (sid) {
			if (sid) {
				this.ne(sid);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	/** register a user.
	* @param mail users mail (compulsory or nickname)
	* @param nickname users nickname (compulsory or mail)
	* @param password users password (necessary if private key is given)
	* @param mainKey main aes key
	* @param signKey ecc sign key
	* @param cryptKey ecc crypt key
	* everything else is added later (profile, groups, etc.)
	*/
	this.register = function (mail, nickname, password, mainKey, signKey, cryptKey, cb) {
		//TODO
		//y rule 1: nickname or mail! one can be empty. check for that!
		//n rule 2: main key valid
		//n rule 3: sign key valid
		//n rule 4: crypt key valid
		//n rule 5: mail&nick valid and unique
		//n rule 6: password valid
		var result;
		var User = require("./user.js");

		step(function () {
			result = {
				errorCodes: {
					nicknameUsed: false,
					mailUsed: false,
					invalidIdentifier: false
				}
			};
		}, h.sF(function nicknameORMail() {
			if (!h.isNickname(nickname)) {
				nickname = null;
			}

			if (!h.isMail(mail)) {
				mail = null;
			}

			if (!nickname && !mail) {
				result.errorCodes.invalidIdentifier = true;
			}

			this();
		}), h.sF(function checkMainKey() {
			var mainKeyO = new SymKey(mainKey);
			//TODO
		}), h.sF(function checkCryptKey() {
			var cryptKeyO = new CryptKey(cryptKey);
			//TODO
		}), h.sF(function checkSignKey() {
			var signKeyO = new SignKey(signKey);
			//TODO
		}));
	};

	/** get the users id
	* checks login in before
	* @author Nilos
	*/
	this.getUserID = function () {
		return userid;
	};

	this.getOwnUser = function (cb) {
		step(function checks() {
			checkLoginError(this);
		}, h.sF(function () {
			if (userid > 0) {
				if (!sessionUser || sessionUser.getID !== userid) {
					var User = require("./user.js");
					sessionUser = new User(userid);
				}

				this.ne(sessionUser);
			}
		}), cb);
	};
};
module.exports = Session;