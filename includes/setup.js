"use strict";

const configManager = require("./configManager");
const config = configManager.get();

const Bluebird = require("bluebird");
const client = require("./redisClient");

const sequelize = require("./dbConnector/sequelizeClient");

module.exports = function (cb) {
	return Bluebird.all([
		sequelize.sync(),
		client.selectAsync(config.db.number || 0)
	]).nodeify(cb);
};
