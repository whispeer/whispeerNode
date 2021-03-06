#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var h = require("whispeerHelper");

const parseDecimal = h.parseDecimal

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

const findAndRemoveDuplicates = (key, arr1, arr2) => {
	const duplicates = arr1.filter((element) => arr2.indexOf(element) > -1)

	if (duplicates.length > 0) {
		return client.sremAsync(key, duplicates).then((count) => {
			console.log(`Removed duplicates for key ${key} [${count}]:`, duplicates)
		})
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
	]).map((arr) => arr.map(parseDecimal)).then(([ ignored, requests, requested, friends ]) => {
		return Bluebird.all([
			findAndRemoveDuplicates(`${base}:ignored`, ignored, requests.concat(requested, friends)),
			findAndRemoveDuplicates(`${base}:requests`, requests, requested.concat(friends)),
			findAndRemoveDuplicates(`${base}:requested`, requested, friends),
		])
	})
}

const fixRequestedToFriendship = (userID) => {
	const base = `friends:${userID}`

	return client.smembersAsync(`${base}:requested`).map(parseDecimal).map((requestedUserID) => {
		return client.smembersAsync(`friends:${requestedUserID}:requested`).map(parseDecimal).then((requested) => {
			if (requested.indexOf(userID) > -1) {
				console.log(`Found requested bug for users: ${userID} - ${requestedUserID}`)

				return Bluebird.all([
					client.saddAsync(`friends:${userID}`, requestedUserID),
					client.saddAsync(`friends:${requestedUserID}`, userID),
				]).then(() => Bluebird.all([
					client.sremAsync(`friends:${userID}:requested`, requestedUserID),
					client.sremAsync(`friends:${requestedUserID}:requested`, userID),
				]))
			}
		})
	})
}

const getAllUserIDs = () => {
	return client.smembersAsync("user:list")
}

return setupP().then(() => {
	return getAllUserIDs()
}).map(parseDecimal).map((userID) => {
	return checkDuplicatesInLists(userID).thenReturn(userID)
}).map((userID) => {
	return fixRequestedToFriendship(userID).thenReturn(userID)
}, {concurrency: 1}).then(() => {
	process.exit()
})
