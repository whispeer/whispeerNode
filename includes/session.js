"use strict";

var step = require("step");
var h = require("whispeerHelper");
var client = require("./redisClient");

var SymKey = require("./crypto/symKey.js");
var EccKey = require("./crypto/eccKey.js");

var settingsService = require("./settings");

/** how long is the session id */
var SESSIONKEYLENGTH = 30;

/** recheck online status every 10 seconds */
var CHECKTIME = 10 * 1000;

var errorService = require("./errorService");

var verifySecuredMeta = require("./verifyObject");

var Bluebird = require("bluebird");

var random = require("secure_random");

/** get a random sid of given length
* @param length length of sid
* @param callback callback
* @callback (error, sid)
*/
function code(length, callback) {
	return Bluebird.try(() => {
		if (length <= 0) {
			throw new Error("length not long enough");
		}

		const promises = []

		for (let i = 0; i < length; i += 1) {
			promises.push(random.getRandomIntAsync(0, h.codeChars.length - 1))
		}

		return Bluebird.all(promises)
	}).map((number) => {
		return h.codeChars[number];
	}).then((numbers) => {
		return numbers.join("");
	}).nodeify(callback);
}

var Session = function Session() {

	var listeners = [];

	/** session id, userid, are we loged in, time we logged in, stay forever? */
	var sid, userid = 0, logedin = false, lastChecked = 0, sessionUser, session = this;

	this.isMyID = function (id) {
		return session.getUserID() === h.parseDecimal(id);
	};

	/** get a session id
	* @param callback called with result (sid)
	* @callback	(err, sid) error and session id
	* @author Nilos
	*/
	function createSession(id, tries = 10) {
		console.log("Create Session!");

		if (tries < 0) {
			throw new Error("session generation failed!!");
		}

		return code(SESSIONKEYLENGTH).then((theSID) => {
			console.log("Generated SID:" + theSID);

			return client.setnxAsync("session:" + theSID, id).then((set) => {
				return set === 1 ? theSID : createSession(id, tries-1)
			})
		})
	}

	function time() {
		return new Date().getTime();
	}

	function internalLogin(uid) {
		return createSession(uid).then((sessionid) => {
			console.log("login changed");
			userid = uid;
			sid = sessionid;
			logedin = true;
			lastChecked = time();

			callListener(logedin);

			return sid;
		})
	}

	/** check if already loged in
	* @callback true/false if still loged in or not
	* @author Nilos
	* it might be that true is returned even if loged out on another tab/pc with the same session.
	* anyhow it will be turned to false shortly after.
	*/
	this.logedin = (cb) => {
		return Bluebird.try(function () {
			if (!logedin) {
				return false;
			}

			if (CHECKTIME < time() - lastChecked) {
				return client.getAsync("session:" + sid).then(function (id) {
					lastChecked = time();
					if (h.parseDecimal(id) !== h.parseDecimal(userid)) {
						console.log("Logout: " + id + " - " + userid);
						return false;
					} else {
						return true;
					}
				});
			} else {
				return true;
			}
		}).nodeify(cb)
	};

	this.logedinError = (cb) => {
		return this.logedin().then((logedin) => {
			if (!logedin) {
				throw new NotLogedin();
			}
		}).nodeify(cb)
	}

	this.isBusiness = (cb) => {
		return client.scardAsync(`user:${userid}:companies`).then((companies) => {
			return companies > 0
		}).nodeify(cb)
	}

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
		return Bluebird.try(function () {
			lastChecked = time();
			return client.getAsync("session:" + theSID);
		}).then((result) => {
			if (!result || !h.isID(result)) {
				return false
			}

			if (!logedin || h.parseDecimal(userid) !== h.parseDecimal(result)) {
				userid = result;
				sid = theSID;
				logedin = true;

				callListener(logedin);
			}

			return true
		}).nodeify(cb);
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
		return Bluebird.try(function () {
			callListener(false);

			const p = client.delAsync(`session:${sid}`);
			logedin = false;
			userid = 0;
			sid = undefined;

			return p
		}).nodeify(cb);
	};

	this._internalLogin = internalLogin;

	/** login
	* @param identifier who wants to log in (mail or nickname)
	* @param externalHash the users password (sha256) (see protocol definition)
	* @param callback called with results
	* @callback (err, loginSuccess) error if something went wrong, loginSuccess true/false if login ok.
	* @author Nilos
	*/
	this.login = function (request, identifier, externalHash, token, cb) {
		var myUser;

		var User = require("./user.js");
		return User.getUser(identifier).then(function (user) {
			myUser = user;
			return myUser.useToken(token);
		}).then(function (tokenUsed) {
			if (tokenUsed !== true) {
				throw new InvalidToken();
			}

			return myUser.getPassword(request);
		}).then(function (internalPassword) {

			var crypto = require("crypto");

			var shasum = crypto.createHash("sha256");
			shasum.update(internalPassword + token);
			var internalHash = shasum.digest("hex");

			if (externalHash !== internalHash) {
				throw new InvalidLogin();
			}

			return internalLogin(myUser.getID());
		}).then(function (theSid) {
			return Boolean(theSid);
		}).nodeify(cb);
	};

	var registerSymKeys = ["main", "friends", "profile"];
	var registerEccKeys = ["sign", "crypt"];

	/** register a user.
	* @param mail users mail (compulsory or nickname)
	* @param nickname users nickname (compulsory or mail)
	* @param password users password (necessary if private key is given)
	* @param mainKey main aes key
	* @param signKey ecc sign key
	* @param cryptKey ecc crypt key
	* everything else is added later (profile, groups, etc.)
	*/
	this.register = function registerF(mail, nickname, password, keys, settings, signedKeys, signedOwnKeys, preID, request, cb) {
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
				settingsInvalid: false,
				invalidmainKey: false,
				invalidprofileKey: false,
				invalidsignKey: false,
				invalidcryptKey: false
			}
		};

		function regErr(code, data) {
			errorService.handleError(new Error(JSON.stringify({
				type: "register error",
				code: code,
				data: data
			})), request);

			if (result.errorCodes[code] !== undefined) {
				result.errorCodes[code] = true;
			} else {
				console.warn("Unknown register error code:" + code);
			}

			result.error = true;
		}

		function createKeys(request, keys, cb) {
			return Bluebird.all([
				Bluebird.all(registerSymKeys.map((registerSymKey) => SymKey.create(request, keys[registerSymKey]))),
				Bluebird.all(registerEccKeys.map((registerEccKey) => EccKey.create(request, keys[registerEccKey]))),
			]).then(function ([symKeys, eccKeys]) {
				return Object.assign(
					{},
					h.arrayToObject(symKeys, (val, index) => registerSymKeys[index]),
					h.arrayToObject(eccKeys, (val, index) => registerEccKeys[index])
				)
			}).nodeify(cb)
		}

		function validateKeys(keys) {
			registerSymKeys.forEach((registerSymKey) => {
				if (!SymKey.validateNoThrow(keys[registerSymKey])) {
					regErr("invalid" + registerSymKey + "Key", keys);
				}
			})

			registerEccKeys.forEach((registerEccKey) => {
				if (!EccKey.validateNoThrow(keys[registerEccKey])) {
					regErr("invalid" + registerEccKey + "Key", keys);
				}
			})
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

			if (!h.isPassword(password.hash) && h.isHex(password.salt) && password.salt.length === 16) {
				regErr("invalidPassword");
			}

			if (mail) {
				console.log("mail:" + mail);
				return User.getUser(mail);
			} else {
				this();
			}
		}, h.hE(function checkNicknameUnique(e) {
			if (!e && mail) {
				regErr("mailUsed");
			}

			return User.isNicknameFree(nickname);
		}, UserNotExisting), h.sF(function (nicknameFree) {
			if (!nicknameFree) {
				regErr("nicknameUsed");
			}

			validateKeys(keys);

			if (!settings || !settings.content.iv || !settings.content.ct) {
				regErr("settingsInvalid");
			}

			return Bluebird.all([
				verifySecuredMeta.byKey(keys.sign, signedKeys, "signedKeys"),
				verifySecuredMeta.byKey(keys.sign, settings.meta, "settings"),
			])
		}, UserNotExisting), h.sF(function createActualUser() {
			if (result.error === true) {
				this.last.ne(result);
			} else {
				var User = require("./user");
				myUser = new User();

				if (mail) {
					myUser.setMail(request, mail, this.parallel());
				}

				if (nickname) {
					myUser.setNickname(request, nickname, this.parallel());
				}

				myUser.setPassword(request, password.hash, this.parallel());
				myUser.setSalt(request, password.salt, this.parallel());
			}
		}), h.sF(function userCreation() {
			myUser.save(request, this);
		}), h.sF(function createS() {
			return internalLogin(myUser.getID());
		}), h.sF(function sessionF(theSid) {
			mySid = theSid;

			return createKeys(request, keys);
		}), h.sF(function keysCreated(theKeys) {
			keys = theKeys;

			myUser.setMainKey(request, keys.main, this.parallel());
			myUser.setFriendsKey(request, keys.friends, this.parallel());
			myUser.setCryptKey(request, keys.crypt, this.parallel());
			myUser.setSignKey(request, keys.sign, this.parallel());
			myUser.setSignedKeys(request, signedKeys, this.parallel());
			myUser.setSignedOwnKeys(request, signedOwnKeys, this.parallel());
			settingsService.setOwnSettings(request, settings, this.parallel());
		}), h.sF(function decryptorsAdded() {
			if (preID) {
				client.sadd("analytics:registration:id:" + preID + ":user", myUser.getID());
			}

			return client.zaddAsync("user:registered", new Date().getTime(), myUser.getID());
		}), h.sF(function () {
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

	this.ownUserError = function (user, cb) {
		if (typeof user === "object" && !user.isSaved()) {
			return Bluebird.resolve().nodeify(cb)
		}

		return session.logedinError().then(() => {
			var sessionUserID = session.getUserID();
			if (typeof user === "object") {
				if (sessionUserID !== user.getID()) {
					throw new AccessViolation("not own user " + sessionUserID + " - " + user.getID());
				}
			} else if (typeof user === "string") {
				if (sessionUserID !== h.parseDecimal(user)) {
					console.log(session.getUserID() + "-" + parseInt(user, 10));
					throw new AccessViolation("not own user " + sessionUserID + " - " + h.parseDecimal(user));
				}
			} else if (typeof user === "number") {
				if (sessionUserID !== user) {
					throw new AccessViolation("not own user " + sessionUserID + " - " + user);
				}
			} else {
				throw new AccessViolation();
			}
		}).nodeify(cb)
	};

	this.getOwnUser = function (cb) {
		return session.logedinError().then(() => {
			if (!sessionUser || sessionUser.getID() !== userid) {
				const User = require("./user.js");
				sessionUser = new User(userid);
			}

			return sessionUser
		}).nodeify(cb)
	};
};

Session.code = code;

module.exports = Session;
