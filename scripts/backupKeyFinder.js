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

function decryptorKeys() {
	return client.keysAsync("key:" + process.argv[3] + "*:decryptor:map").map(function (key) {
		key = key.split(":");
		return key[1] + ":" + key[2];
	});
}

function userBackupKeys(userid) {
	client.keysAsync("user:" + userid + ":backupKeys");
}

var keyHash = process.argv[2];

setupP().then(function () {
	console.log("Looking for backup key with parent key: " + keyHash);
	return client.smembersAsync("user:list");
}).map(function (userid) {
	return userBackupKeys(userid).filter(function (keyID) {
		console.log(keyID);
		return client.hgetallAsync("key:" + keyID + ":decryptor:map").then(function (decryptors) {
			var keyIDs = Object.keys(decryptors).map(function (keyID) {
				return keyID.split(":")[1];
			});

			console.log(keyIDs);
			console.log(keyIDs.indexOf(keyHash));

			return keyIDs.indexOf(keyHash) > -1;
		});
	});
}).map(function (matchingKeys) {
	if (matchingKeys.length > 0) {
		console.log("Found key: " + matchingKeys);
	}

	return matchingKeys;
}).then(function () {
	console.log("done finding key");
	process.exit();
});
