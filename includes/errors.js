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

function addError(desc, propagateOutside) {
	var err = function (msg, inner) {
		err.super_.call(this, desc + "\r\n" + msg, this.constructor);
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

global.StepError = addError("Step Error", false);
global.NotLogedin = addError("Session invalid", true);
global.InvalidLogin = addError("Login details wrong!", true);
global.AccessViolation = addError("Access Violation", true);
global.InvalidToken = addError("Token Invalid", true);

/** user part */
global.UserNotExisting = addError("User Not Existing", true);

global.MailInUse = addError("Mail already in use", true);
global.NicknameInUse = addError("Nickname already in use", true);
global.InvalidPassword = addError("INvalid Password", true);
global.InvalidAttribute = addError("invalid attribute", true);

global.InvalidProfile = addError("Invalid Profile", true);

/** end user part */

/** crypto part */
global.LostDecryptor = addError("Decryptor not Found");
global.InvalidDecryptor = addError("Decryptor data invalid");
global.RealIDInUse = addError("RealID already in use.");
global.InvalidRealID = addError("RealID invalid.");

global.NotASymKey = addError("Not a symmetric key", true);
global.InvalidSymKey = addError("invalid symmetric key data", true);
global.NotAEccKey = addError("Not a elliptic curve key", true);
global.InvalidEccKey = addError("invalid elliptic curve key", true);

global.InvalidKey = addError("invalid key", true);

global.InvalidHexError = addError("invalid hex", true);

/** end crypto part */

/** message part */

global.InvalidTopicData = addError("invalid Message Topic", true);
global.InvalidMessageData = addError("invalid Message Data", true);
global.TopicNotExisting = addError("topic not existing", true);
global.MessageNotExisting = addError("message not existing", true);

/** end message part */

/** post part */

global.InvalidPost = addError("invalid post", true);
global.InvalidFilter  = addError("invalid filter", true);

/** end post part */

global.InvalidCircleData = addError("invalid circle data", true);
global.TimeSpanExceeded  = addError("timespan has been exceeded", true);

module.exports = possibleErrors;
