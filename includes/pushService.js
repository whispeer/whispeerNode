"use strict";

var gcm = require("node-gcm");
var apn = require("apn");

var h = require("whispeerHelper");

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

var pushService = {
	listenFeedback: function (cb) {
		var feedback = new apn.Feedback(config.push.apn);
		feedback.on("feedback", cb);
	},
	pushAndroid: function (token, data) {
		console.log("pushing android: " + token, data);
		var notification = new gcm.Message({
			data: data
		});

		var sendPushToGCM = Bluebird.promisify(sender.send, sender);

		return sendPushToGCM(notification, [token], 4);
	},
	pushIOS: function (token, payload, title, badge, expiry, sandbox) {
		console.log("pushing ios: " + token);
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		payload["content-available"] = 1;
		payload.test = 5;

		notification.payload = payload;
		notification.expiry = expiry || 0;
		notification.alert = title;
		notification.badge = badge;
		notification.sound = "default";

		console.log(notification);

		if (sandbox) {
			apnConnectionSandbox.pushNotification(notification, myDevice);
		} else {
			apnConnection.pushNotification(notification, myDevice);
		}

		return Bluebird.resolve();
	}
};

module.exports = pushService;
