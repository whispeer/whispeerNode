#!/usr/bin/env node

/* eslint-disable no-console */

"use strict";

const Bluebird = require("bluebird");
const _ = require("lodash");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");

const setupP = Bluebird.promisify(setup);

Bluebird.try(async () => {
	await setupP();

  const messageKeys = await client.keysAsync("message:*");

  console.log("Deleting Message Keys", messageKeys.length);

  const chunks = _.chunk(messageKeys, 5000);
  await Bluebird.map(chunks, (keys) => client.delAsync(keys), { concurrency: 1 });

  const topicKeys = await client.keysAsync("topic:*");

  console.log("Deleting Topic Keys", topicKeys.length);

  const chunks2 = _.chunk(topicKeys, 5000);
  await Bluebird.map(chunks2, (keys) => client.delAsync(keys), { concurrency: 1 });
}).then(function () {
  process.exit();
});
