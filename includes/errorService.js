"use strict";

var errorService = {
	handleError: function (e) {
		if (e) {
			try {
				console.error(e);

				var errString;
				try {
					errString = JSON.stringify(e);
				} catch (e) {
					errString = e.toString();
				}

				var mailer = require("./mailer");
				mailer.mailAdmin("An Error occured", errString + "\r\n" + e.stack);
			} catch (e) {
				console.error(e);
			}
		}
	}
};

module.exports = errorService;