#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var h = require("whispeerHelper");
var User = require("../includes/user");

var Bluebird = require("bluebird");

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

function removeUserPosts(userid) {

}

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

function removeUserComments() {

}

function removeUserNotifications() {

}

function removeUserSettings() {

}

function removeUserProfiles() {

}

function removeUserTrustManager() {

}

function removeUserSignatureCache() {

}

function removeUserSignedKeys() {
	
}

function removeUserBackupKeys() {
	
}

function removeUserFriends() {

}

function removeUserKeys() {
	
}

function removeUserMainData() {

}

var deleteUserID = parseInt(process.argv[2], 10);

if (deleteUserID < 1 || !deleteUserID) {
	console.log("Invalid user id");
	process.exit(-1);
}

requireConfirmation("Deleting user " + deleteUserID).then(function () {
	return setupP();
}).then(function () {
	return removeUserFromSearch(deleteUserID);
}).then(function () {
	return removeUserPosts(deleteUserID);
}).then(function () {
	process.exit();
});
