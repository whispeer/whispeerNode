#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var setupP = Bluebird.promisify(setup);

function requestMock(userID) {
	return {
		session: {
			getUserID: function () {
				return userID;
			}
		}
	};
}

var keyHash = process.argv[2];

setupP().then(function () {
	console.log("Looking for backup key with parent key: " + keyHash);
	return client.smembers("user:list");
}).map(function (userid) {
	return client.smembersAsync("user:" + userid + ":backupKeys").filter(function (keyID) {
		console.log(keyID);
		return client.hgetAllAsync("key:" + keyID + ":decryptor:map", keyHash).then(function (decryptors) {
			console.log(decryptors);
			return decryptors.hasOwnProperty(keyHash);
		});
	}).then(function (matchingKeys) {
		//console.log(matchingKeys);
	});
}).map(function () {
	return "";
}).then(function (results) {
	console.log(results.reduce(function (prev, cur) { return prev && cur; }, true));

	console.log("done checking signatures");
	process.exit();
});
