"use strict";

const client = require("./redisClient");

const settingsAPI = {
	updateServer: function (uid, key, val, cb) {
		return settingsAPI.getUserSettings(uid).then(function (settings) {
			settings.server = settings.server || {};
			settings.server[key] = val;
			return settingsAPI.setUserSettings(uid, settings, this);
		}).nodeify(cb)
	},
	getUserSettings: function (uid, cb) {
		return client.getAsync("user:" + uid + ":settings").then(function (result) {
			if (!result) {
				return { server: {} };
			}

			const parsedResult = JSON.parse(result);
			parsedResult.server = parsedResult.server || {};

			return parsedResult;
		}).nodeify(cb)
	},
	setUserSettings: function (uid, settings, cb) {
		return settingsAPI.getUserSettings(uid)
			.then((oldSettings) => {
				if (!settings.server) {
					settings.server = oldSettings.server || {};
				}

				return settings;
			})
			.then((settings) => client.setAsync("user:" + uid + ":settings", JSON.stringify(settings)))
			.then((res) => res === "OK")
			.nodeify(cb)
	},
	getOwnSettings: function (request, cb) {
		return settingsAPI.getUserSettings(request.session.getUserID()).nodeify(cb)
	},
	setOwnSettings: function (request, settings, cb) {
		return settingsAPI.setUserSettings(request.session.getUserID(), settings).nodeify(cb)
	}
};

module.exports = settingsAPI;
