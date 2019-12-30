#!/usr/bin/env node

/* eslint-disable no-console */



const Bluebird = require("bluebird");
const _ = require("lodash");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");

const setupP = Bluebird.promisify(setup);

const deleteByPattern = async (pattern) => {
	const patternKeys = await client.keysAsync(pattern);

	console.log(`Deleting keys ${pattern} (${patternKeys.length})`);

	const chunks = _.chunk(patternKeys, 5000);
	await Bluebird.map(chunks, (keys) => client.delAsync(keys), { concurrency: 1 });
}

Bluebird.try(async () => {
	await setupP();

  await deleteByPattern("message:*");
  await deleteByPattern("topic:*");
	await deleteByPattern("analytics:registration:*");
	await deleteByPattern("analytics:mail:trackingCodes:*");
	await deleteByPattern("invites:*");
	await deleteByPattern("notifications:*");
	await deleteByPattern("waterline:*");
	await deleteByPattern("search:*");
	await deleteByPattern("settings:*");

	await deleteByPattern("analytics:online:hour:*")

	for (let i = 2013; i < 2019; i += 1) {
		await deleteByPattern(`analytics:online:day:${i}-*`)
		await deleteByPattern(`analytics:online:week:${i} *`)
		await deleteByPattern(`analytics:online:month:${i}-*`)
	}
}).then(function () {
  process.exit();
});
