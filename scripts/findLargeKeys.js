#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

function scanKeys() {
	return client.keysAsync("message:*:content").map(function (key) {
		return client.hgetAsync(key, "ct").then(function (val) {
			if (val.length > 10000) {
				console.log(key, val.length);
			}
		});
	});
}

setupP().then(function () {
	return scanKeys();
}).then(function () {
	process.exit();
});
