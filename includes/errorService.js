"use strict";

var mailer = require("./mailer");

var errorService = {
	handleError: function (e) {
		if (e) {
			console.error(e);

			var errString;
			try {
				errString = JSON.stringify(e);
			} catch (e) {
				errString = e.toString();
			}
			mailer.mailAdmin("An Error occured", errString + "\r\n" + e.stack);
		}
	}
};

module.exports = errorService;