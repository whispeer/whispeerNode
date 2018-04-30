#!/usr/bin/env node

"use strict";

const pushAPI = require("../includes/pushAPI")
const setup = require("../includes/setup");

const userID = parseInt(process.argv[2], 10);
const count = parseInt(process.argv[3], 10);

if ((!count && count !== 0) || !userID) {
  console.warn("Usage: pushBadgeTest.js userID count");

  process.exit(0);
}

setup()
	.then(() => pushAPI.updateBadgeForUser(userID, count))
	.then(() => process.exit())
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
