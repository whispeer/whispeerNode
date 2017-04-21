"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");
var Bluebird = require("bluebird");

var pushService = require("../pushService");

const pushTokenModel = sequelize.define("pushToken", {
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

			if (this.deviceType === "android") {
				var androidData = {
					vibrationPattern: [0, 400, 500, 400],
					ledColor: [0, 0, 255, 0]
				};

				if (reference) {
					androidData.reference = reference;
				}

				if (reference && reference.type === "message") {
					androidData.topicid = reference.id;
				}

				androidData.title = title;
				androidData.message = "-";

				return pushService.pushAndroid(this.token, androidData);
			}

			if (this.deviceType === "ios") {
				if (this.userID === 1) {
					this.sandbox = true;
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

				return pushService.pushIOS(this.token, payload, title, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		},
		pushIOSBadge: function (badge) {
			if (this.deviceType === "ios") {
				return pushService.pushIOSBadge(this.token, badge, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		},
		pushData: function(data) {
			if (this.deviceType === "android") {
				if (!data) {
					return Bluebird.reject("No data");
				}

				var androidData = {
					"content-available": "1"
				};

				if (!this.pushKey) {
					console.warn("No push key for token: " + this.token);
					return Bluebird.resolve();
				}

				var sjcl = require("../crypto/sjcl");
				console.log("Encrypting push using key: " + this.pushKey);
				androidData.encryptedContent = sjcl.encrypt(sjcl.codec.hex.toBits(this.pushKey), JSON.stringify(data));

				return pushService.pushAndroid(this.token, androidData);
			}

			if (this.deviceType === "ios") {
				return Bluebird.resolve();
			}

			return Bluebird.reject("push: invalid type");
		}
	}
});

module.exports = pushTokenModel;
