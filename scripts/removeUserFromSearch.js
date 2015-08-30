#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var KeyApi = require("../includes/crypto/KeyApi");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);


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

function removeUserFromSearch(userid) {
	var search = require("../includes/search");
	var remove = Bluebird.promisify(search.user.remove, search.user);

	return remove(userid).then(function () {
		console.log("removed user from search");
		return client.keysAsync("search:friends:*:search:id:" + userid);
	}).map(function (key) {
		var otherID = key.split(":")[2];
		console.log("removed from friends search: " + otherID);
		var friendsSearch = new search.friendsSearch(otherID);

		var removeFriendsSearch = Bluebird.promisify(friendsSearch.remove, friendsSearch);
		return removeFriendsSearch(userid);
	});
}

var deleteUserID = parseInt(process.argv[2], 10);

if (deleteUserID < 1 || !deleteUserID) {
	console.log("Invalid user id");
	process.exit(-1);
}

requireConfirmation("Removing user from search: " + deleteUserID).then(function () {
	return setupP();
}).then(function () {
	return removeUserFromSearch(deleteUserID);
}).then(function () {
	process.exit();
});
