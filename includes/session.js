"use strict";

var step = require("step");
var h = require("whispeerHelper");
var client = require("./redisClient");

var SymKey = require("./crypto/symKey.js");
var EccKey = require("./crypto/eccKey.js");

var settingsService = require("./settings");

//delete session if it was not used for 30 days.
var SESSIONTIME = 30 * 24 * 60 * 60;

/** how long is the session id */
var SESSIONKEYLENGTH = 30;

/** recheck online status every 10 seconds */
var CHECKTIME = 10 * 1000;

/** get a random sid of given length 
* @param length length of sid
* @param callback callback
* @callback (error, sid)
*/
function code(length, callback) {
	var random = require("secure_random");

	step(function generateRandom() {
		if (length <= 0) {
			throw new Error("length not long enough");
		}

		var i = 0;
		for (i = 0; i < length; i += 1) {
			random.getRandomInt(0, h.codeChars.length - 1, this.parallel());
		}

		return;
	}, function (err, numbers) {
		if (err) {
			callback(err);
			return;
		}

		var result = "", i = 0;

		for (i = 0; i < numbers.length; i += 1) {
			result = result + h.codeChars[numbers[i]];
		}

		callback(null, result);
	});
}

var Session = function Session() {

	var listeners = [];

	/** session id, userid, are we loged in, time we logged in, stay forever? */
	var sid, userid = 0, logedin = false, lastChecked = 0, sessionUser, session = this;



	/** get a session id
	* @param callback called with result (sid)
	* @callback	(err, sid) error and session id
	* @author Nilos
	*/
	function createSession(id, callback, tries) {
		console.log("Create Session!");

		var tempSID;

		if (tries < 0) {
			console.error("session generation failed!!");
		}

		step(function generate() {
			code(SESSIONKEYLENGTH, this);
		}, h.sF(function (theSID) {
			console.log("Generated SID:" + theSID);

			tempSID = theSID;

			client.setnx("session:" + tempSID, id, this);
		}), h.sF(function (set) {
			if (set === 1) {
				client.expire("session:" + tempSID, SESSIONTIME);
				this.ne(tempSID);
			} else {
				createSession(id, this.last, tries-1);
				return;
			}
		}), callback);
	}

	function time() {
		return new Date().getTime();
	}

	function internalLogin(uid, callback) {
		step(function () {
			createSession(uid, this);
		}, h.sF(function (sessionid) {
			console.log("login changed");
			userid = uid;
			sid = sessionid;
			logedin = true;
			lastChecked = time();

			callListener(logedin);

			this.ne(sid);
		}), callback);
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
				console.log("Not logged in");
				this.last.ne(false);
			}
		}, h.sF(function (id) {
			lastChecked = time();
			if (parseInt(id, 10) !== parseInt(userid, 10)) {
				console.log("Logout: " + id + " - " + userid);
				this.ne(false);
			} else {
				client.expire("session:" + sid, SESSIONTIME);
				this.ne(true);
			}
		}), cb);
	}

	function checkLoginError(cb) {
		step(function () {
			session.logedin(this);
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

	function callListener(logedin) {
		process.nextTick(function () {
			var i;
			for (i = 0; i < listeners.length; i += 1) {
				try {
					listeners[i](logedin);
				} catch (e) {
					console.error(e);
				}
			}
		});
	}

	this.changeListener = function changeListenerF (listener) {
		listeners.push(listener);
	};

	/** set the session id
	* @param cb called with results
	* @param theSID session id to set to
	* @callback (err, logedin) err: something went wrong; logedin: session loged in.
	* @author Nilos
	*/
	this.setSID = function (theSID, cb) {
		step(function () {
			lastChecked = time();
			client.get("session:" + theSID, this);
		}, h.sF(function (result) {
			if (result && h.isID(result)) {
				if (!logedin || userid != result) {
					userid = result;
					sid = theSID;
					logedin = true;

					callListener(logedin);
				}

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
			callListener(false);

			client.del("session:" + sid, this);
			logedin = false;
			userid = 0;
			sid = undefined;
		}, cb);
	};

	/** login
	* @param identifier who wants to log in (mail or nickname)
	* @param externalHash the users password (sha256) (see protocol definition)
	* @param callback called with results
	* @callback (err, loginSuccess) error if something went wrong, loginSuccess true/false if login ok.
	* @author Nilos
	*/
	this.login = function loginF(view, identifier, externalHash, token, cb) {
		var myUser;
		step(function () {
			var User = require("./user.js");
			User.getUser(identifier, this);
		}, h.sF(function (user) {
			myUser = user;
			myUser.useToken(token, this);
		}), h.sF(function (tokenUsed) {
			if (tokenUsed !== true) {
				throw new InvalidToken();
			}

			myUser.getPassword(view, this);
		}), h.sF(function (internalPassword) {

			var crypto = require("crypto");

			var shasum = crypto.createHash("sha256");
			shasum.update(internalPassword + token);
			var internalHash = shasum.digest("hex");

			if (externalHash === internalHash) {
				internalLogin(myUser.getID(), this);
			} else {
				throw new InvalidLogin();
			}
		}), h.sF(function (theSid) {
			if (theSid) {
				this.ne(true);
			} else {
				this.ne(false);
			}
		}), cb);
	};

	var registerSymKeys = ["main", "friends", "friendsLevel2", "profile"];
	var registerEccKeys = ["sign", "crypt"];
	var keyName = registerSymKeys.concat(registerEccKeys);

	/** register a user.
	* @param mail users mail (compulsory or nickname)
	* @param nickname users nickname (compulsory or mail)
	* @param password users password (necessary if private key is given)
	* @param mainKey main aes key
	* @param signKey ecc sign key
	* @param cryptKey ecc crypt key
	* everything else is added later (profile, groups, etc.)
	*/
	this.register = function registerF(mail, nickname, password, keys, settings, view, cb) {
		//y rule 1: nickname must be set.
		//y rule 2: main key valid
		//y rule 3: sign key valid
		//y rule 4: crypt key valid
		//y rule 5: mail&nick valid and unique
		//y rule 6: password valid
		var User = require("./user.js");
		var myUser, mySid;

		var result = {
			error: false,
			errorCodes: {
				nicknameUsed: false,
				mailUsed: false,
				invalidIdentifier: false,
				invalidPassword: false,
				nicknameInvalid: false,
				mailInvalid: false,
				settingsInvalid: false
			}
		};

		function regErr(code) {
			if (result.errorCodes[code] !== undefined) {
				result.errorCodes[code] = true;
			} else {
				console.warn("Unknown register error code:" + code);
			}

			result.error = true;
		}

		function createKeys(view, keys, cb) {
			step(function () {
				var i;
				for (i = 0; i < registerSymKeys.length; i += 1) {
					SymKey.createWDecryptors(view, keys[registerSymKeys[i]], this.parallel());
				}

				for (i = 0; i < registerEccKeys.length; i += 1) {
					EccKey.createWDecryptors(view, keys[registerEccKeys[i]], this.parallel());
				}
			}, h.sF(function (keys) {
				keys = h.arrayToObject(keys, function (val, index) {
					return keyName[index];
				});

				this.ne(keys);
			}), cb);
		}

		function validateKeys(keys, cb) {
			step(function () {
				var i;
				for (i = 0; i < registerSymKeys.length; i += 1) {
					SymKey.validateNoThrow(keys[registerSymKeys[i]], this.parallel());
				}

				for (i = 0; i < registerEccKeys.length; i += 1) {
					EccKey.validateNoThrow(keys[registerEccKeys[i]], this.parallel());
				}
			}, h.sF(function (res) {
				var i;
				for (i = 0; i < res.length; i += 1) {
					if (!res[i]) {
						regErr("invalid" + keyName[i] + "Key");
					}
				}

				this.ne();
			}), cb);
		}

		step(function nicknameSet() {
			if (!h.isNickname(nickname)) {
				if (nickname !== "" && nickname) {
					regErr("nicknameInvalid");
				}
				nickname = null;
			}

			if (!h.isMail(mail)) {
				if (mail !== "" && mail) {
					regErr("mailInvalid");
				}
				mail = null;
			}

			if (!nickname) {
				regErr("invalidIdentifier");
			}

			if (!h.isPassword(password)) {
				regErr("invalidPassword");
			}

			this();
		}, h.sF(function checkMailUnique() {
			if (mail) {
				console.log("mail:" + mail);
				User.getUser(mail, this);
			} else {
				this();
			}
		}), h.hE(function checkNicknameUnique(e) {
			if (!e && mail) {
				regErr("mailUsed");
			}

			if (nickname) {
				User.getUser(nickname, this);
			} else {
				this();
			}
		}, UserNotExisting), h.hE(function checkMainKey(e) {
			if (!e && nickname) {
				regErr("nicknameUsed");
			}

			validateKeys(keys, this);
		}, UserNotExisting), h.sF(function validateSettings() {
			if (!settings || !settings.iv || !settings.ct) {
				regErr("settingsInvalid");
			}

			this.ne();
		}), h.sF(function createActualUser() {
			if (result.error === true) {
				this.last.ne(result);
			} else {
				var User = require("./user");
				myUser = new User();

				if (mail) {
					myUser.setMail(view, mail, this.parallel());
				}

				if (nickname) {
					myUser.setNickname(view, nickname, this.parallel());
				}

				myUser.setPassword(view, password, this.parallel());
			}
		}), h.sF(function userCreation() {
			myUser.save(view, this);
		}), h.sF(function createS() {
			internalLogin(myUser.getID(), this);
		}), h.sF(function sessionF(theSid) {
			mySid = theSid;

			createKeys(view, keys, this);
		}), h.sF(function keysCreated(theKeys) {
			keys = theKeys;

			myUser.setMainKey(view, keys.main, this.parallel());
			myUser.setFriendsKey(view, keys.friends, this.parallel());
			myUser.setFriendsLevel2Key(view, keys.friendsLevel2, this.parallel());
			myUser.setCryptKey(view, keys.crypt, this.parallel());
			myUser.setSignKey(view, keys.sign, this.parallel());
			settingsService.setOwnSettings(view, settings, this.parallel());
		}), h.sF(function decryptorsAdded() {
			this.ne(mySid);
		}), cb);
	};

	/** get the users id
	* checks login in before
	* @author Nilos
	*/
	this.getUserID = function () {
		return h.parseDecimal(userid);
	};

	this.getOwnUser = function (cb) {
		step(function checks() {
			checkLoginError(this);
		}, h.sF(function () {
			if (userid > 0) {
				if (!sessionUser || sessionUser.getID() !== userid) {
					var User = require("./user.js");
					sessionUser = new User(userid);
				}

				this.ne(sessionUser);
			}
		}), cb);
	};
};

Session.code = code;

module.exports = Session;