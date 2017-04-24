"use strict";

var Bluebird = require("bluebird");

var client = require("./redisClient");
var errorService = require("./errorService");

var pushService = require("./pushService");

const pushToken = require("./models/pushTokenModel");

pushService.listenFeedback(function (devices) {
	Bluebird.resolve(devices).then(function (devices) {
		console.log(devices);

		if (devices.length === 0) {
			return;
		}

		var tokens = devices.map(function (deviceInfo) {
			return deviceInfo.device.token.toString("hex");
		});

		console.info("removing ios devices from database: " + JSON.stringify(tokens));

		return pushToken.destroy({ where: { token: tokens }});
	}).catch(errorService.handleError);
});

var translations = {
	"en": {
		default: "New content on whispeer",
		message: "New Message from {user}",
		contactRequest: "New contact request from {user}"
	},
	"de": {
		default: "Neuigkeiten bei whispeer",
		message: "Neue Nachricht von {user}",
		contactRequest: "Neue Kontaktanfrage von {user}"
	}
};

function getTranslations(userLanguage) {
	if (!translations[userLanguage]) {
		return translations.en;
	}

	return translations[userLanguage];
}

function getTitle(referenceType, userLanguage, userName) {
	if (referenceType) {
		return getTranslations(userLanguage)[referenceType].replace("{user}", userName);
	}

	return getTranslations(userLanguage)["default"];
}

var getPushTokens = function (users) {
	return pushToken.findAll({ where: { userID: users }});
}

var pushAPI = {
	subscribe: function (request, type, token, pushKey, cb) {
		return Bluebird.try(function () {
			if (type !== "android" && type !== "ios") {
				throw new Error("invalid type");
			}
		}).then(function () {
			var givenData = {
				userID: request.session.getUserID(),
				deviceType: type,
				pushKey: pushKey,
				token: token
			};

			return pushToken.findOne({ where: { token: token }}).then(function (record) {
				if (!record) {
					console.log("CREATE: " + JSON.stringify(givenData));
					return pushToken.create(givenData);
				}

				if (record.userID !== givenData.userID || record.pushKey !== givenData.pushKey) {
					console.log("UPDATE: " + JSON.stringify(givenData));
					return pushToken.destroy({ where: { token: token }}).then(function () {
						return pushToken.create(givenData);
					});
				}
			});
		}).nodeify(cb);
	},
	getTitle: function (user, referenceType, username) {
		return user.getLanguage().then(function (userLanguage) {
			return getTitle(referenceType, userLanguage, username);
		});
	},
	updateBadgeForUser: function (userID) {
		return client.zcardAsync("topic:user:" + userID + ":unreadTopics").then(function (unreadMessageCount) {
			return getPushTokens([userID]).filter((token) => {
				return token.deviceType === "ios"
			}).map(function (token) {
				return token.pushIOSBadge(unreadMessageCount);
			});
		})
	},
	pushDataToUser: function (user, data) {
		return getPushTokens([user.getID()]).map(function (token) {
			return token.pushData(data);
		});
	},
	notifyUser: function (user, title, reference) {
		return getPushTokens([user.getID()]).map(function (token) {
			return token.pushNotification(title, reference);
		});
	}
};

module.exports = pushAPI;
