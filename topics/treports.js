"use strict";

var mailer = require("../includes/mailer.js");

var reports =  {
	add: function(data, fn, request) {
		var content = {
			"sender": request.session.getUserID(),
			"report": data
		};

		mailer.mailAdmin("User sent a Report", JSON.stringify(content), fn);
	}
};

module.exports = reports;