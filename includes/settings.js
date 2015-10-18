"use strict";

var step = require("step");
var client = require("./redisClient");

/*
	Settings: {
		data: encryptedObject
	}

*/

var settingsAPI = {
	updateServer: function (uid, key, val, cb) {
		return step.unpromisify(settingsAPI.getUserSettings(uid).then(function (settings) {
			settings.server = settings.server || {};
			settings.server[key] = val;
			return settingsAPI.setUserSettings(uid, settings, this);
		}), cb);
	},
	getUserSettings: function (uid, cb) {
		return step.unpromisify(client.getAsync("user:" + uid + ":settings").then(function (result) {
			if (!result) {
				return {};
			}

			return JSON.parse(result);
		}), cb);
	},
	setUserSettings: function (uid, settings, cb) {
		return step.unpromisify(settingsAPI.getUserSettings(uid).then(function (oldSettings) {
			if (!settings.server) {
				settings.server = oldSettings.server || {};
			}

			return settings;
		}).then(function (settings) {
			return client.setAsync("user:" + uid + ":settings", JSON.stringify(settings));
		}).then(function (res) {
			return res === "OK";
		}), cb);
	},
	getOwnSettings: function (request, cb) {
		return settingsAPI.getUserSettings(request.session.getUserID(), cb);
	},
	setOwnSettings: function (request, settings, cb) {
		return settingsAPI.setUserSettings(request.session.getUserID(), settings, cb);
	}
};

module.exports = settingsAPI;
