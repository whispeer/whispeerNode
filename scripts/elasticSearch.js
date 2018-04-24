#!/usr/bin/env node

"use strict";

const setup = require("../includes/setup");
const addNamesToElastic = require("../migrations/00008-elasticsearch");


setup()
	.then(() => addNamesToElastic())
	.then(() => process.exit())
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
