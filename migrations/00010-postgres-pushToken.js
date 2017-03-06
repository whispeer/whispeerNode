var Bluebird = require("bluebird");
var	client = require("../includes/redisClient");

const sequelize = require("../includes/dbConnector/sequelizeClient");
const pushTokenModel = require("../includes/models/pushTokenModelSequelize");

const getAllPushTokenIDs = () => {
	"use strict";

	return client.smembersAsync("waterline:pushtoken:id");
};

const getPushToken = (id) => {
	"use strict";

	return client.getAsync(id).then((pushToken) => {
		return JSON.parse(pushToken);
	}).then((pushToken) => {
		delete pushToken.id;
		
		return pushToken;
	});
};

const tokens = {};

function addTopicUpdatesToPostgres(cb) {
	"use strict";
	return Bluebird.resolve().then(function () {
		return sequelize.sync();
	}).then(() => {
		return getAllPushTokenIDs();
	}).map(function (pushTokenID) {
		console.log("id", pushTokenID);
		return getPushToken(pushTokenID);
	}).filter((pushToken) => {
		if (tokens[pushToken.token]) {
			console.error(pushToken, tokens[pushToken.token]);
			
			return false;
		}
		
		tokens[pushToken.token] = pushToken;
		
		return true;
	}).then((pushTokens) => {
		return sequelize.transaction((transaction) => {
			return Bluebird.resolve(pushTokens).map((pushToken) => {
				return pushTokenModel.create(pushToken, {transaction: transaction});
			});
		});
	}).nodeify(cb);
}

module.exports = addTopicUpdatesToPostgres;
