#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
const CompanyUser = require("../includes/models/companyUser")

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

var userID = parseInt(process.argv[2], 10);
var companyID = process.argv[3]

if (userID < 1 || !userID) {
	console.log("Invalid user id. Usage: addCompanyToUser userID companyID");
	process.exit(1);
}

if (!companyID) {
	console.log("Company id is required. Usage: addCompanyToUser userID companyID");
	process.exit(2);
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
				process.exit(0);
			}
		});
	} else {
		action();
	}
});

const getCompaniesForUser = (userID) => {
	return CompanyUser.findAll({ where: { userID } })
}

const addCompanyID = (userID, CompanyId) => {
	return CompanyUser.create({ userID, CompanyId })
}

const promise = setupP().then(() => {
	return getCompaniesForUser(userID)
}).then((oldCompanies) => {
	if (oldCompanies.length > 0) {
		const companyIDs = oldCompanies.map((c) => c.CompanyId)

		if (companyIDs.indexOf(parseInt(companyID, 10)) > -1) {
			throw new Error(`User is already in company ${companyID}`)
		}

		return requireConfirmation(`Adding company ${companyID} to user ${userID}. Is already in companies ${companyIDs.join(",")}`)
	}
}).then(() => addCompanyID(userID, companyID)).then(() => {
	process.exit()
})

promise.catch((e) => {
	console.error(e)

	process.exit(4)
})
