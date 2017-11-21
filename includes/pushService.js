"use strict";

var gcm = require("node-gcm");
var apn = require("apn");

var configManager = require("./configManager");
var config = configManager.get();

var Bluebird = require("bluebird");

var sender = new gcm.Sender(config.push.gcmAPIKey);

var apnConnection = new apn.Connection(config.push.apn);
var apnConnectionSandbox = new apn.Connection(config.push.apnSandbox);

const getExpiry = (time) => {
	return Math.floor(new Date().getTime() / 1000) + time
}

const pushIOSProductionOrSandbox = (notification, device, sandbox) => {
	if (sandbox) {
		return apnConnectionSandbox.pushNotification(notification, device);
	}

	apnConnection.pushNotification(notification, device);
}

const pushService = {
	listenAPNError: (cb) => apnConnection.on("transmissionError", cb),
	listenFeedback: function (cb) {
		var feedback = new apn.Feedback(config.push.apn);
		feedback.on("feedback", cb);
	},
	pushAndroid: function (token, data) {
		var notification = new gcm.Message({ data });

		var sendPushToGCM = Bluebird.promisify(sender.send, { context: sender });

		return sendPushToGCM(notification, [token], 4);
	},
	pushIOSBadge: function (token, badge, sandbox) {
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.expiry = getExpiry(60);
		notification.badge = badge;

		pushIOSProductionOrSandbox(notification, myDevice, sandbox)

		return Bluebird.resolve();
	},
	pushIOSData: function (token, payload, sandbox) {
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.contentAvailable = 1

		notification.payload = payload;
		notification.expiry = getExpiry(60*60);
		notification.priority = 5;

		pushIOSProductionOrSandbox(notification, myDevice, sandbox)

		return Bluebird.resolve();
	},
	pushIOS: function (token, payload, title, sandbox) {
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.payload = payload;
		notification.expiry = getExpiry(24*60*60);
		notification.alert = title;
		notification.sound = "default";

		pushIOSProductionOrSandbox(notification, myDevice, sandbox)

		return Bluebird.resolve();
	}
};

module.exports = pushService;
