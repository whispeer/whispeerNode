"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");
var Bluebird = require("bluebird");

var pushService = require("../pushService");

var sandBoxUsers = [1, 43, 2496]

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

			var payload = {};

			if (reference) {
				payload = {
					reference: reference
				};

				if (reference.type === "message") {
					payload.topicid = reference.id;
				}
			}

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
				return pushService.pushIOSBadge(this.token, badge, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		},
		pushData: function(data) {
			if (!data) {
				return Bluebird.reject("No data");
			}

			if (!this.pushKey) {
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

module.exports = pushTokenModel;
