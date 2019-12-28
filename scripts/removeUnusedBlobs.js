#!/usr/bin/env node

/* eslint-disable no-console */

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

Bluebird.try(async () => {
	await setupP();
  // client.

}).then(function () {
  process.exit();
});
