"use strict";

var errorService = {
	handleError: function (e, request) {
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

				var requestString = "";

				if (request) {
					requestString += "\n\n";
					requestString += "User: " + request.session.getUserID() + "\n";
					requestString += "Channel: " + request.channel + "\n";
					requestString += "Raw Request: " + JSON.stringify(request.rawRequest);
				}

				var mailer = require("./mailer");
				mailer.mailAdmin("An Error occured (" + (e.type || error.substr(0, 70)) + ")", errString + "\n" + e.stack + requestString);
			} catch (e) {
				console.error(e);
			}
		}
	}
};

module.exports = errorService;
