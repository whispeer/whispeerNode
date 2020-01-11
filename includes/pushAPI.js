"use strict";

const Bluebird = require("bluebird");

const errorService = require("./errorService");

const configManager = require("./configManager");
const config = configManager.get();

const CompanyUser = require("./models/companyUser")
const pushToken = require("./models/pushToken");
const pushService = require("./pushService");

if (!config.push) {
	// eslint-disable-next-line no-console
	console.warn("No Push Service Configured");

	module.exports = {
		subscribe: (request, type, token, pushKey, cb) => Bluebird.resolve().nodeify(cb),
		getTitle: () => Bluebird.resolve(),
		updateBadgeForUser: () => Bluebird.resolve(),
		pushDataToUser: () => Bluebird.resolve(),
		notifyUser: () => Bluebird.resolve()
	}

	return;
}

/*TODO pushService.listenFeedback(function (devices) {
	Bluebird.resolve(devices).then(function (devices) {
		if (devices.length === 0) {
			return;
		}

		var tokens = devices.map(function (deviceInfo) {
			return deviceInfo.device.token.toString("hex");
		});

		// eslint-disable-next-line no-console
		console.info("removing ios devices from database: " + JSON.stringify(tokens));

		return pushToken.destroy({ where: { token: tokens }});
	}).catch(errorService.handleError);
});*/

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
	return pushToken.findAll({ where: { userID: users, disabled: false }});
}

const errorMessages = {
	"400": "Bad request",
	"403": "There was an error with the certificate or with the provider authentication token",
	"405": "The request used a bad :method value. Only POST requests are supported.",
	"410": "The device token is no longer active for the topic.",
	"413": "The notification payload was too large.",
	"429": "The server received too many requests for the same device token.",
	"500": "Internal server error",
	"503": "The server is shutting down and unavailable.",
}


pushService.listenAPNError((token, errCode, notification, fullFailure) => {
	const extra = errorMessages[errCode] || ""

	if (!errCode) {
		errorService.handleError(new Error(`Unknown APN Error ${token} ${JSON.stringify(fullFailure)}`))
		return
	}

	if (errCode === "410") {
		if (notification.reason === "Unregistered") {
			return pushToken.destroy({ where: { token }})
		}
	}

	if (errCode === "400") {
		pushToken.findOne({ where: { token }}).then((pushInfo) => {
			if (!pushInfo.sandbox) {
				return pushInfo.update({ sandbox: true })
			}

			if (pushInfo.sandbox && pushInfo.errorCount > 42) {
				return pushInfo.update({ disabled: true })
			}

			return pushInfo.increment("errorCount")
		})
	}

	errorService.handleError(new Error(`APN Error ${extra} (${errCode}) for device ${token} - ${JSON.stringify(notification)}`))

})

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
					return pushToken.create(givenData);
				}

				if (record.userID !== givenData.userID || record.pushKey !== givenData.pushKey) {
					return pushToken.destroy({ where: { token: token }}).then(function () {
						return pushToken.create(givenData);
					});
				}
			});
		}).nodeify(cb);
	},
	getTitle: function (user, referenceType, username) {
		return Bluebird.all([
			user.getLanguage(),
			CompanyUser.isBusinessUser(user.getID())
		]).then(function ([userLanguage, isBusinessUser]) {
			const lang = isBusinessUser ? "de" : userLanguage;

			return getTitle(referenceType, lang, username);
		});
	},
	updateBadgeForUser: (userID, notificationsCount) => {
		return getPushTokens([userID])
			// .filter(token => token.deviceType === "ios")
			.map(token => token.pushBadge(notificationsCount))
	},
	pushDataToUser: function (userId, data) {
		return getPushTokens([userId]).map(function (token) {
			return token.pushData(data);
		});
	},
	notifyUser: function (userId, title, reference) {
		return getPushTokens([userId]).map(function (token) {
			return token.pushNotification(title, reference);
		});
	}
};

module.exports = pushAPI;
