/* global global, require */

"use strict";
var util = require("util");
var possibleErrors = [];

var AbstractError = function (msg, constr) {
	Error.captureStackTrace(this, constr || this);
	this.message = msg || "Error";
};
util.inherits(AbstractError, Error);
AbstractError.prototype.name = "Abstract Error";

function addError(desc, id, propagateOutside) {
	var err = function (msg, inner) {
		err.super_.call(this, desc + "\r\n" + msg, this.constructor);
		this.msg = msg || "";
		this.id = id;
		this.inner = inner;
	};
	util.inherits(err, AbstractError);
	err.prototype.message = desc;
	err.prototype.propagateOutside = !!propagateOutside;

	possibleErrors.push(err);

	return err;
}

global.isOwnError = function (err) {
	var i;
	for (i = 0; i < possibleErrors.length; i += 1) {
		if (err instanceof possibleErrors[i]) {
			return true;
		}
	}

	return false;
};

global.StepError = addError("Step Error", 1, false);
global.NotLogedin = addError("Session invalid", 10, true);
global.InvalidLogin = addError("Login details wrong!", 11, true);
global.AccessViolation = addError("Access Violation", 12, true);
global.InvalidToken = addError("Token Invalid", 13, true);

/** user part */
global.UserNotExisting = addError("User Not Existing", 20, true);
global.MailInUse = addError("Mail already in use", 21, true);
global.NicknameInUse = addError("Nickname already in use", 22, true);
global.InvalidPassword = addError("INvalid Password", 23, true);
global.InvalidAttribute = addError("invalid attribute", 24, true);

global.InvalidProfile = addError("Invalid Profile", 25, true);

/** end user part */

/** crypto part */
global.LostDecryptor = addError("Decryptor not Found");
global.InvalidDecryptor = addError("Decryptor data invalid");
global.RealIDInUse = addError("RealID already in use.");
global.InvalidRealID = addError("RealID invalid.");

global.NotASymKey = addError("Not a symmetric key", 30, true);
global.InvalidSymKey = addError("invalid symmetric key data", 31, true);
global.NotAEccKey = addError("Not a elliptic curve key", 32, true);
global.InvalidEccKey = addError("invalid elliptic curve key", 33, true);
global.InvalidKey = addError("invalid key", 34, true);
global.KeyNotFound = addError("key not found", 35, true);
global.InvalidHexError = addError("invalid hex", 36, true);

/** end crypto part */

/** message part */

global.InvalidTopicData = addError("invalid Message Topic", 40, true);
global.InvalidMessageData = addError("invalid Message Data", 41, true);
global.TopicNotExisting = addError("topic not existing", 42, true);
global.MessageNotExisting = addError("message not existing", 43, true);
global.SuccessorError = addError("successor error", 44, true)

/** end message part */

/** post part */

global.InvalidPost = addError("invalid post", 50, true);
global.InvalidFilter  = addError("invalid filter", 51, true);

/** end post part */

global.CircleNotExisting = addError("circle not existing", 60, true);
global.InvalidCircleData = addError("invalid circle data", 61, true);
global.TimeSpanExceeded  = addError("timespan has been exceeded", 62, true);


global.InvalidBlobID = addError("invalid blob id", 70, true);
global.BlobNotFound = addError("blob not found", 71, true);

global.BreakPromiseChain = addError("break promise chain", 100, true);

module.exports = possibleErrors;
