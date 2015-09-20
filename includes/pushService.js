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
		pushAndroid: function () { return Promise.resolve(); },
		pushIOS: function () { return Promise.resolve(); },
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
	pushAndroid: function (data) {
		var notification = new gcm.Message({
			data: data
		});

		var sendPushToGCM = Bluebird.promisify(sender.send, sender);

		return sendPushToGCM(notification, [this.token], 4);
	},
	pushIOS: function (payload, title, badge, expiry) {
		var myDevice = new apn.Device(this.token);
		var notification = new apn.Notification();

		notification.payload = payload;
		notification.expiry = expiry || 0;
		notification.alert = title;
		notification.badge = badge;

		apnConnection.pushNotification(notification, myDevice);

		return Promise.resolve();
	}
};

module.exports = pushService;
