#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

var userID = parseInt(process.argv[2], 10);
var companyID = process.argv[3]

if (userID < 1 || !userID) {
	console.log("Invalid user id. Usage: addUserCompany userID companyID");
	process.exit(-1);
}

if (!companyID) {
	console.log("Company id is required. Usage: addUserCompany userID companyID");
	process.exit(-1);
}

// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
var requireConfirmation = Bluebird.promisify(function(message, action) {
	console.log(message);
	if (process.stdout.isTTY) {
		var stdin = process.openStdin();
		console.log("Press y and enter to continue!");

		stdin.on("data", function(chunk) {
			if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
				action();
			} else {
				console.log("Aborted!");
				process.exit(-1);
			}
		});
	} else {
		action();
	}
});

const getUserCompanies = (userID) => {
	return client.smembersAsync(`user:${userID}:companies`)
}

const setCompanyID = (userID, companyID) => {
	return client.saddAsync(`user:${userID}:companies`, companyID)
}

return setupP().then(() => {
	return getUserCompanies(userID)
}).then((oldCompanies) => {
	if (oldCompanies.length > 0) {
		return requireConfirmation(`Adding company id to user ${userID} and existing companies ${oldCompanies.join(",")} (adding: ${companyID})` )
	}
}).then(() => setCompanyID(userID, companyID)).then(() => {
	process.exit()
})
