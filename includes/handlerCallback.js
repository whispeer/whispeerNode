"use strict";

var extend = require("xtend");
var errorService = require("./errorService");

var HandlerCallback = function (fn, request) {
	var finished = false;
	var resultErrors = {};
	var result = {
		error: false
	};

	var finish = function () {
		if (!finished) {
			finished = true;

			if (result.error) {
				result.errorData = resultErrors;
			}

			fn(result);
		} else {
			console.error("double callback");
			//throw new Error("double callback");
		}
	};

	var doResult = function doResult(err, value) {
		if (err) {
			result = {
				error: true
			};

			errorService.handleError(err, {
				user: request.session.getUserID()
			});
		} else {
			result = extend(result, value);
		}

		finish();
	};

	doResult.error = function errorF(errorData) {
		result = {
			error: true
		};

		resultErrors = extend(resultErrors, errorData);
	};

	doResult.error.protocol = function (errorData) {
		result.error = true;
		resultErrors.protocolError = true;
		resultErrors = extend(resultErrors, errorData);

		finish();
	};

	return doResult;
};

module.exports = HandlerCallback;