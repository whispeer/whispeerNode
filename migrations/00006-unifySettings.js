"use strict";

var step = require("step");
var Bluebird = require("bluebird");

var client = require("../includes/redisClient");

var settingsAPI = require("../includes/settings");

function unifySettings(cb) {
	step.unpromisify(client.smembersAsync("user:list").map(function (uid) {
		return Bluebird.all([
			settingsAPI.getUserSettings(uid),
			client.hgetallAsync("settings:" + uid)
		]).spread(function (userSettings, userServerSettings) {
			userSettings.server = userSettings.server || userServerSettings || {};

			if (userSettings.server.mailsEnabled === "1") {
				userSettings.server.mailsEnabled = true;
			} else if (userSettings.server.mailsEnabled === "0") {
				userSettings.server.mailsEnabled = false;
			}

			return settingsAPI.setUserSettings(uid, userSettings);
		}).then(function () {
			return client.delAsync("settings:" + uid);
		});
	}), cb);
}

module.exports = unifySettings;
