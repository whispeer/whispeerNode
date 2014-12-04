"use strict";

var errorService = {
	handleError: function (e, data) {
		if (e) {
			try {
				console.error(e);

				var error = "Unknown Error";
				if (e.stack) {
					error = e.stack.split("\n")[0];
				}

				var errString;
				try {
					errString = JSON.stringify(e);
				} catch (e) {
					errString = e.toString();
				}

				var mailer = require("./mailer");
				mailer.mailAdmin("An Error occured (" + (e.type || error.substr(0, 30)) + ")", errString + "\r\n" + e.stack);
			} catch (e) {
				console.error(e);
			}
		}
	}
};

module.exports = errorService;