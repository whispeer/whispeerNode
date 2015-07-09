#!/usr/bin/env node

"use strict";

var util = require("util");
var invites = require("./includes/invites");

var requestStub = {
	session: {
		logedinError: function (cb) { cb(); },
		getUserID: function () { return -1; }
	}
};


var configManager = require("./includes/configManager");
var config = configManager.get();
var client = require("./includes/redisClient");

var fs = require("fs");

var mails = fs.readFileSync(process.argv[2]).toString().split("\n").filter(function (str) {
	return str.indexOf("@") > -1;
});

client.select(config.db.number || 0, function (e) {
	if (e) {
		throw e;
	}
 
	util.error(util.format("Database selected: %d", config.db.number || 0));

	invites.byMail(requestStub, mails, "Nils Kenneweg", "de", function (e, c) {
		if (e) {
			throw e;
		}

		util.puts("All mails send! (" + mails.length + ")");

		process.exit();
	});
});
