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

global.UserNotExisting = addError("User Not Existing");
global.StepError = addError("Step Error");
