"use strict";

const gcm = require("node-gcm");
const apn = require("apn");

const configManager = require("./configManager");
const config = configManager.get();

const Bluebird = require("bluebird");

if (!config.push) {
	console.warn("No Push Service Configured");

	module.exports = {}

	return;
}

const sender = new gcm.Sender(config.push.gcmAPIKey);

const apnConnection = new apn.Provider(config.push.apn);
// const apnConnectionSandbox = new apn.Provider(config.push.apnSandbox);

const getExpiry = (time) => {
	return Math.floor(new Date().getTime() / 1000) + time
}

const apnErrors = []

const sendPush = (connection, notification, token) => {
	connection.send(notification, token).then((response) => {
		if (response.failed.length > 0) {
			apnErrors.forEach((cb) =>
				response.failed.forEach((info) => {
					const { device, status, response } = info
					cb(device, status, response, info)
				})
			)
		}
	})
}

const pushIOSProductionOrSandbox = (notification, token, sandbox) => {
	if (sandbox) {
		// sendPush(apnConnectionSandbox, notification, token)
		return
	}

	sendPush(apnConnection, notification, token)
}

const pushService = {
	listenAPNError: (cb) => {
		apnErrors.push(cb)
	},
	pushAndroid: function (token, data) {
		var notification = new gcm.Message({ data });

		var sendPushToGCM = Bluebird.promisify(sender.send, { context: sender });

		return sendPushToGCM(notification, [token], 4);
	},
	pushIOSBadge: function (token, badge, sandbox) {
		var notification = new apn.Notification();

		notification.expiry = getExpiry(60);
		notification.badge = badge;
		notification.topic = "whispeer.app"

		pushIOSProductionOrSandbox(notification, token, sandbox)

		return Bluebird.resolve();
	},
	pushIOSData: function (token, payload, sandbox) {
		var notification = new apn.Notification();

		notification.contentAvailable = 1

		notification.payload = payload;
		notification.expiry = getExpiry(60*60);
		notification.priority = 5;
		notification.topic = "whispeer.app"

		pushIOSProductionOrSandbox(notification, token, sandbox)

		return Bluebird.resolve();
	},
	pushIOS: function (token, payload, title, sandbox) {
		var notification = new apn.Notification();

		notification.payload = payload;
		notification.expiry = getExpiry(24*60*60);
		notification.alert = title;
		notification.sound = "default";
		notification.topic = "whispeer.app"

		pushIOSProductionOrSandbox(notification, token, sandbox)

		return Bluebird.resolve();
	}
};

module.exports = pushService;
