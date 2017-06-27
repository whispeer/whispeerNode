/* eslint-disable no-console */

"use strict";

// var Bluebird = require("bluebird");
var client = require("../../includes/redisClient");

// const sequelize = require("../../includes/dbConnector/sequelizeClient");
// const pushTokenModel = require("../../includes/models/pushTokenModel");

function migrateTopic() {

}

function scanTopics(error, topics) {
	if (error) {
		console.error("Error scanning topics.")
		process.exit(1)
	}

	topics[1].map(migrateTopic)

	if (topics[0] !== "0") {
		process.stderr.write(".")
		client.scan(topics[0], "match", "topic:*:meta", "count", 5, scanTopics)
	} else {
		console.error("\n")
		process.exit(0)
	}
}

client.scan(0, "match", "topic:*:meta", "count", 5, scanTopics)
