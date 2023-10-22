const Bluebird = require("bluebird");
const Sequelize = require("sequelize");

const sequelize = require("../dbConnector/sequelizeClient");

const pushService = require("../pushService");

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
	},

	errorCount: {
		type: Sequelize.INTEGER,
		defaultValue: 0
	},

	disabled: {
		type: Sequelize.BOOLEAN,
		defaultValue: false
	}

}, {});

pushToken.prototype.pushNotification = (title, reference) => {
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
		return pushService.pushIOS(this.token, payload, title, this.sandbox);
	}

	return Bluebird.reject("push: invalid type");
};

pushToken.prototype.pushBadge = (badge) => {
	if (this.deviceType === "ios") {
		console.log(`Push badge ${badge} to ${this.token}`)
		return pushService.pushIOSBadge(this.token, badge, this.sandbox);
	}

	if (this.deviceType === "android") {
		console.log(`Push badge ${badge} to ${this.token}`)

		const payload = { badge };

		return pushService.pushAndroid(this.token, payload);
	}

	return Bluebird.reject("push: invalid type");
};

pushToken.prototype.pushData =(data) => {
	if (!data) {
		return Bluebird.reject("No data");
	}

	if (!this.pushKey) {
		// eslint-disable-next-line no-console
		console.warn("No push key for token: " + this.token);
		return Bluebird.resolve();
	}

	var sjcl = require("./crypto/sjcl");
	const encryptedContent = sjcl.encrypt(sjcl.codec.hex.toBits(this.pushKey), JSON.stringify(data));

	var payload = {
		encryptedContent
	};

	if (this.deviceType === "android") {
		payload["content-available"] = "1"

		return pushService.pushAndroid(this.token, payload);
	}

	if (this.deviceType === "ios") {
		return pushService.pushIOSData(this.token, payload, this.sandbox);
	}

	return Bluebird.reject("push: invalid type");
};

module.exports = pushToken;
