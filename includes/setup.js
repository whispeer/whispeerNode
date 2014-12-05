"use strict";

var configManager = require("./configManager");
var config = configManager.get();

var step = require("step");
var client = require("./redisClient");

module.exports = function (cb) {
	step(function () {
		console.log("Database selected: " + (config.db.number || 0));
		client.select(config.db.number || 0, this);
	}, cb);
};