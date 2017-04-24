"use strict";

var gcm = require("node-gcm");
var apn = require("apn");

var configManager = require("./configManager");
var config = configManager.get();

var Bluebird = require("bluebird");

var errorService = require("./errorService");

if (!config.push) {
	console.warn("No Push Service Configured");

	module.exports = {
		listenFeedback: function () {},
		pushAndroid: function () { return Bluebird.resolve(); },
		pushIOS: function () { return Bluebird.resolve(); },
	};

	return;
}

var sender = new gcm.Sender(config.push.gcmAPIKey);
var apnConnection = new apn.Connection(config.push.apn);

var apnConfigSandbox = JSON.parse(JSON.stringify(config.push.apn));
apnConfigSandbox.production = false;
var apnConnectionSandbox = new apn.Connection();

apnConnection.on("transmissionError", function (errCode, notification, device) {
	var message = "APN Transmission Error:";

	message += "\nNotification caused error: " + errCode + " for device " + JSON.stringify(device) + "-" + JSON.stringify(notification);
    if (errCode === 8) {
        message += "\nA error code of 8 indicates that the device token is invalid. This could be for a number of reasons - are you using the correct environment? i.e. Production vs. Sandbox";
    }

	errorService.handleError(new Error(message));
});

const getExpiry = (time) => {
	return Math.floor(new Date().getTime() / 1000) + time
}

var pushService = {
	listenFeedback: function (cb) {
		var feedback = new apn.Feedback(config.push.apn);
		feedback.on("feedback", cb);
	},
	pushAndroid: function (token, data) {
		// console.log("pushing android: " + token, data);
		var notification = new gcm.Message({
			data: data
		});

		var sendPushToGCM = Bluebird.promisify(sender.send, sender);

		return sendPushToGCM(notification, [token], 4);
	},
	pushIOSBadge: function (token, badge, sandbox) {
		return Bluebird.resolve();

		console.log("pushing ios (badge): " + token);
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.expiry = getExpiry(60);
		notification.badge = badge;

		if (sandbox) {
			apnConnectionSandbox.pushNotification(notification, myDevice);
		} else {
			apnConnection.pushNotification(notification, myDevice);
		}

		return Bluebird.resolve();
	},
	pushIOSData: function (token, payload, sandbox) {
		console.log("pushing ios (data): " + token);
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.contentAvailable = 1

		notification.payload = payload;
		notification.expiry = getExpiry(60*60);
		notification.priority = 5;

		console.log("pushing ios (data): ", notification.compile())

		if (sandbox) {
			apnConnectionSandbox.pushNotification(notification, myDevice);
		} else {
			apnConnection.pushNotification(notification, myDevice);
		}

		return Bluebird.resolve();
	},
	pushIOS: function (token, payload, title, sandbox) {
		return Bluebird.resolve();

		console.log("pushing ios (notification): " + token);
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.payload = payload;
		notification.expiry = getExpiry(24*60*60);
		notification.alert = title;
		notification.sound = "default";

		if (sandbox) {
			apnConnectionSandbox.pushNotification(notification, myDevice);
		} else {
			apnConnection.pushNotification(notification, myDevice);
		}

		return Bluebird.resolve();
	}
};

module.exports = pushService;
