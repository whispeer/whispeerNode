"use strict";

var errorService = {
	handleError: function (e, data) {
		if (e) {
			try {
				console.error(e);

				var error = "Unknown Error";
				var stack = e.stack;

				if (!e.stack) {
					//lets get a stack from here on
					try {
						throw new Error(error);
					} catch (e) {
						stack = e.stack;
					}
				}

				error = stack.split("\n")[0];

				var errString;
				try {
					errString = JSON.stringify(e);
				} catch (e) {
					errString = e.toString();
				}

				var mailer = require("./mailer");
				mailer.mailAdmin("An Error occured (" + (e.type || error.substr(0, 70)) + ")", errString + "\n" + e.stack + (data ? "\n" + JSON.stringify(data) : ""));
			} catch (e) {
				console.error(e);
			}
		}
	}
};

module.exports = errorService;