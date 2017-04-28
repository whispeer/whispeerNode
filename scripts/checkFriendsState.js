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
}

const checkDuplicatesInLists = (userID) => {
	const base = `friends:${userID}`

	return Bluebird.all([
		client.smembersAsync(`${base}.ignored`),
		client.smembersAsync(`${base}.requests`),
		client.smembersAsync(`${base}.requested`),
		client.smembersAsync(`${base}`),
	]).then(([ ignored, requests, requested, friends ]) => {
		findAndRemoveDuplicates(`${base}.ignored`, ignored, requests.concat(requested, friends))
		findAndRemoveDuplicates(`${base}.requests`, requests, requested.concat(friends))
		findAndRemoveDuplicates(`${base}.requested`, requested, friends)
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
	return client.smembersAsync()
}

return setupP().then(() => {
	return getAllUserIDs()
}).map((userID) => {
	return checkUserFriendsState(userID)
})
