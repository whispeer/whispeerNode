"use strict";
var util = require('util');

var AbstractError = function (msg, constr) {
	Error.captureStackTrace(this, constr || this);
	this.message = msg || 'Error';
};
util.inherits(AbstractError, Error);
AbstractError.prototype.name = 'Abstract Error';

function addError(desc) {
	var err = function (msg, inner) {
		err.super_.call(this, msg, this.constructor);
		this.inner = inner;
	};
	util.inherits(err, AbstractError);
	err.prototype.message = desc;

	return err;
}

global.StepError = addError("Step Error");
global.NotLogedin = addError("Session invalid");
global.InvalidLogin = addError("Login details wrong!");
global.AccessViolation = addError("Access Violation");
global.InvalidToken = addError("Token Invalid");

/** user part */
global.UserNotExisting = addError("User Not Existing");

global.MailInUse = addError("Mail already in use");
global.NicknameInUse = addError("Nickname already in use");
/** end user part */

/** crypto part */
global.LostDecryptor = addError("Decryptor not Found");
global.InvalidDecryptor = addError("Decryptor data invalid");
global.RealIDInUse = addError("RealID already in use.");

global.NotASymKey = addError("Not a symmetric key");
global.InvalidSymKey = addError("invalid symmetric key data");
global.NotAEccKey = addError("Not a elliptic curve key");
global.InvalidEccKey = addError("invalid elliptic curve key");
/** end crypto part */
