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

function getTitle(reference, userLanguage, userName) {
	if (reference && reference.type) {
		return getTranslations(userLanguage)[reference.type].replace("{user}", userName);
	}

	return getTranslations(userLanguage)["default"];
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
	}, notifyUsers: function (users, data, reference) {
		return Bluebird.resolve(users).map(function (user) {
			return pushAPI.notifyUser(user, data, reference);
		});
	}, notifyUser: function (user, data, reference) {
		return Bluebird.all([
			client.zcardAsync("topic:user:" + user.getID() + ":unreadTopics"),
			user.getLanguage()
		]).spread(function (unreadMessageCount, userLanguage) {
			return pushAPI.sendNotification(
				[user.getID()],
				data,
				unreadMessageCount,
				getTitle(reference, userLanguage, data.user),
				reference
			);
		});
	}, sendNotification: function (users, data, badgeCount, title, reference) {
		console.log("pushing to users: " + JSON.stringify(users));
		return pushToken.findAll({ where: { userID: users }}).map(function (userPushToken) {
			console.log("got a userPushToken. Sending Push!", title, badgeCount);
			return userPushToken.push(data, title, badgeCount, reference);
		});
	}
};

module.exports = pushAPI;
