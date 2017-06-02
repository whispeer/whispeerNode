#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

Bluebird.try(() => {
	return setup()
}).then(() => {
	return client.keysAsync(process.argv[2])
}).map((key) => {
	return client.hgetallAsync(key);
}).map((obj) => {
	return Object.keys(obj)
}).then((keys) => {
	if (keys.length === 0) {
		console.warn("no matching keys")
		return
	}

	const baseKeys = keys[0]
	const addedKeys = []
	const removedKeys =[]

	console.log(`Initial keys ${baseKeys.join(",")}`)

	for (let i = 0; i < keys.length ; i += 1) {
		const newKeys = keys[i].filter((key) => {
			return baseKeys.indexOf(key) === -1 && addedKeys.indexOf(key) === -1
		})

		if (newKeys.length > 0) {
			console.warn(`New keys: ${newKeys.join(",")}`)
		}

		addedKeys.push.apply(addedKeys, newKeys)

		const keyRemovedKeys = baseKeys.filter((key) => keys[i].indexOf(key) === -1 && removedKeys.indexOf(key) === -1)

		if (keyRemovedKeys.length > 0) {
			console.warn(`Removed keys: ${keyRemovedKeys.join(",")}`)
		}

		removedKeys.push.apply(removedKeys, keyRemovedKeys)
	}
}).then(() => process.exit(0))
