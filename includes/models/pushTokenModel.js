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
		push: function(data, title, badge, reference) {
			if (this.deviceType === "android") {
				if (!data && !title && !reference) {
					return;
				}

				var androidData = {
					vibrationPattern: [0, 400, 500, 400],
					ledColor: [0, 0, 255, 0]
				};

				if (reference.type === "message") {
					androidData.topicid = reference.id;
				}

				if (title) {
					androidData.title = title;
					androidData.message = "-";
				}

				if (data) {
					if (this.pushKey) {
						var sjcl = require("../crypto/sjcl");
						console.log("Using key: " + this.pushKey);
						androidData.encryptedContent = sjcl.encrypt(sjcl.codec.hex.toBits(this.pushKey), JSON.stringify(data));
					} else {
						androidData.content = data;
					}
				}

				return pushService.pushAndroid(this.token, androidData);
			}

			if (this.deviceType === "ios") {
				if (this.userID === 1) {
					this.sandbox = true;
				}
				
				var payload = {
					reference: reference
				};
				
				if (reference.type === "message") {
					payload.topicid = reference.id;
				}
				
				return pushService.pushIOS(this.token, payload, title, badge, 0, this.sandbox);
			}

			return Bluebird.reject("push: invalid type");
		}
	}
});

module.exports = pushTokenModel;
