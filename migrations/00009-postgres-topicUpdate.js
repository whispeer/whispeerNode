var Bluebird = require("bluebird");
var	client = require("../includes/redisClient");

const sequelize = require("../includes/dbConnector/sequelizeClient");
const topicUpdateModel = require("../includes/models/topicUpdateModel");

var h = require("whispeerHelper");

const getAllTopicIDs = () => {
	"use strict";

	return client.keysAsync("topic:*:meta").filter((key) => {
		return key.split(":").length === 3;
	}).map((key) => {
		return key.split(":")[1];
	});
};

const getAllTopicUpdates = (topicID) => {
	"use strict";

	const listKey = `topic:${topicID}:topicUpdate:list`;

	return client.zrangeAsync(listKey, 0, -1).map((topicUpdateID) => {
		return Bluebird.all([
			client.getAsync(`topic:${topicID}:topicUpdate:${topicUpdateID}`),
			client.zscoreAsync(listKey, topicUpdateID)
		]);
	}).map(([topicUpdateJSON, createdAt]) => {
		const topicUpdate = JSON.parse(topicUpdateJSON);
		topicUpdate.topicID = topicID;
		topicUpdate.createdAt = new Date(h.parseDecimal(createdAt));

		return topicUpdate;
	});
};

function addTopicUpdatesToPostgres(cb) {
	"use strict";
	return Bluebird.resolve().then(function () {
		return sequelize.sync();
	}).then(() => {
		return getAllTopicIDs();
	}).map(function (topicID) {
		return getAllTopicUpdates(topicID);
	}).then((topicUpdates) => {
		return h.array.flatten(topicUpdates);
	}).then(function (topicUpdates) {
		return sequelize.transaction((transaction) => {
			return Bluebird.resolve(topicUpdates).map((topicUpdate) => {
				return topicUpdateModel.create(topicUpdate, {transaction: transaction});
			});
		});
	}).nodeify(cb);
}

module.exports = addTopicUpdatesToPostgres;
