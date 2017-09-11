"use strict";

const Bluebird = require("bluebird");
const Sequelize = require("sequelize");

const errorService = require("./errorService");
const sequelize = require("./dbConnector/sequelizeClient");

const configManager = require("./configManager");
const config = configManager.get();

if (!config.push) {
	// eslint-disable-next-line no-console
	console.warn("No Push Service Configured");

	module.exports = {
		subscribe: () => Bluebird.resolve(),
		getTitle: () => Bluebird.resolve(),
		updateBadgeForUser: () => Bluebird.resolve(),
		pushDataToUser: () => Bluebird.resolve(),
		notifyUser: () => Bluebird.resolve()
	}

	return
}

const pushService = require("./pushService");

const sandBoxUsers = [1, 43, 2496]

const pushToken = sequelize.define("pushToken", {
	id: {
		type: Sequelize.UUID,
		allowNull: false,
		defaultValue: Sequelize.UUIDV4,
		primaryKey: true
	},

	userID: {
		type: Sequelize.INTEGER,
		allowNull: false
	},

	deviceType: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: {
			is: /^(android|ios)$/
		}
	},

	token: {
		type: Sequelize.STRING,
		allowNull: false,
		unique: true
	},

	pushKey: {
		type: Sequelize.STRING,
		unique: false
	},

	sandbox: {
		type: Sequelize.BOOLEAN
	}

}, {
	instanceMethods: {
		pushNotification: function (title, reference) {
			if (!title) {
				return Bluebird.reject("No title");
			}

			var payload = {};

			if (reference) {
				payload = {
					reference: reference
				};

				if (reference.type === "message") {
					payload.topicid = reference.id;
				}
			}

			// eslint-disable-next-line no-console
			console.log(`Pushing to ${this.deviceType} device ${this.token}: ${title}`)

			if (this.deviceType === "android") {
				payload.vibrationPattern = [0, 400, 500, 400]
				payload.ledColor = [0, 0, 255, 0]

				payload.title = title;
				payload.message = "-";

				return pushService.pushAndroid(this.token, payload);
			}

			if (this.deviceType === "ios") {
				if (sandBoxUsers.indexOf(this.userID) > -1) {
					this.sandbox = true;
				}

				return pushService.pushIOS(this.token, payload, title, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		},
		pushIOSBadge: function (badge) {
			if (this.deviceType === "ios") {
				if (sandBoxUsers.indexOf(this.userID) > -1) {
					this.sandbox = true;
				}

				return pushService.pushIOSBadge(this.token, badge, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		},
		pushData: function(data) {
			if (!data) {
				return Bluebird.reject("No data");
			}

			if (!this.pushKey) {
				// eslint-disable-next-line no-console
				console.warn("No push key for token: " + this.token);
				return Bluebird.resolve();
			}

			var sjcl = require("../crypto/sjcl");
			const encryptedContent = sjcl.encrypt(sjcl.codec.hex.toBits(this.pushKey), JSON.stringify(data));

			var payload = {
				encryptedContent
			};

			if (this.deviceType === "android") {
				payload["content-available"] = "1"

				return pushService.pushAndroid(this.token, payload);
			}

			if (this.deviceType === "ios") {
				if (sandBoxUsers.indexOf(this.userID) > -1) {
					this.sandbox = true;
				}

				return pushService.pushIOSData(this.token, payload, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		}
	}
});

pushService.listenFeedback(function (devices) {
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
		return user.getLanguage().then(function (userLanguage) {
			return getTitle(referenceType, userLanguage, username);
		});
	},
	updateBadgeForUser: (userID, notificationsCount) => {
		return getPushTokens([userID])
			.filter(token => token.deviceType === "ios")
			.map(token => token.pushIOSBadge(notificationsCount))
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
