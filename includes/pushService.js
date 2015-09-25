"use strict";

var gcm = require("node-gcm");
var apn = require("apn");

var configManager = require("./configManager");
var config = configManager.get();

var Bluebird = require("bluebird");

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

var pushService = {
	listenFeedback: function (cb) {
		var feedback = new apn.Feedback(config.push.apn);
		feedback.on("feedback", cb);
	},
	pushAndroid: function (token, data) {
		var notification = new gcm.Message({
			data: data
		});

		var sendPushToGCM = Bluebird.promisify(sender.send, sender);

		return sendPushToGCM(notification, [token], 4);
	},
	pushIOS: function (token, payload, title, badge, expiry) {
		var myDevice = new apn.Device(token);
		var notification = new apn.Notification();

		notification.payload = payload;
		notification.expiry = expiry || 0;
		notification.alert = title;
		notification.badge = badge;

		apnConnection.pushNotification(notification, myDevice);

		return Bluebird.resolve();
	}
};

module.exports = pushService;
