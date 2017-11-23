#!/usr/bin/env node

"use strict";

const setup = require("../includes/setup");
const client = require("../includes/redisClient");

const helper = require("whispeerHelper")

const Bluebird = require("bluebird");
Bluebird.longStackTraces();

const setupP = Bluebird.promisify(setup);

const checkSignedList = (signedList) => {
	return client.hgetallAsync(signedList)
		.then((entry) =>
			Object.keys(entry)
				.map((k) => entry[k])
				.filter((key) => helper.isRealID(key))
		)
		.filter((key) => client.existsAsync(`key:${key}`).then((b) => !b))
		.then((missing) => missing.length > 0 ? console.log(missing) : null)
}

Bluebird.try(() => {
	return setupP();
}).then(() => {
	return client.keysAsync("friends:*:signedList")
}).map((signedList) => {
	return checkSignedList(signedList)
}).then(() => {
	process.exit(0)
})
