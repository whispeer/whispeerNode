#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

const findAndRemoveDuplicates = (key, arr1, arr2) => {
	const duplicates = arr1.filter((element) => arr2.indexOf(element) > -1)

	if (duplicates.length > 0) {
		console.log(`Duplicates for ${key}`, duplicates)
	}

	return Bluebird.resolve()
}

const checkDuplicatesInLists = (userID) => {
	const base = `friends:${userID}`

	return Bluebird.all([
		client.smembersAsync(`${base}:ignored`),
		client.smembersAsync(`${base}:requests`),
		client.smembersAsync(`${base}:requested`),
		client.smembersAsync(`${base}`),
	]).map((arr) => arr.map((val) => parseInt(val, 10))).then(([ ignored, requests, requested, friends ]) => {
		// console.log([ ignored, requests, requested, friends ])
		return Bluebird.all([
			findAndRemoveDuplicates(`${base}:ignored`, ignored, requests.concat(requested, friends)),
			findAndRemoveDuplicates(`${base}:requests`, requests, requested.concat(friends)),
			findAndRemoveDuplicates(`${base}:requested`, requested, friends),
		])
	})
}

const fixRequestedToFriendship = (userID) => {

}

const checkUserFriendsState = (userID) => {
	return checkDuplicatesInLists(userID).then(() => {
		return fixRequestedToFriendship(userID)
	})
}

const getAllUserIDs = () => {
	return client.smembersAsync("user:list")
}

return setupP().then(() => {
	return getAllUserIDs()
}).map((userID) => {
	return checkUserFriendsState(userID)
}).then(() => {
	process.exit()
})
