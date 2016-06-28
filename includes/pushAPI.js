"use strict";

var Bluebird = require("bluebird");

var client = require("./redisClient");
var errorService = require("./errorService");
var waterlineLoader = require("./models/waterlineLoader");

var pushService = require("./pushService");

waterlineLoader.then(function (ontology) {
	var pushToken = ontology.collections.pushtoken;

	pushService.listenFeedback(function (devices) {
		Bluebird.resolve(devices).then(function (devices) {
			console.log(devices);

			if (devices.length === 0) {
				return;
			}

			var tokens = devices.map(function (deviceInfo) {
				return deviceInfo.device.token.toString("hex");
			});

			console.info("removing ios devices from database: " + JSON.stringify(tokens));

			return pushToken.destroy({ token: tokens });
		}).catch(errorService.handleError);
	});

});

var translations = {
	"en": {
		title: "Message from {user}"
	},
	"de": {
		title: "Nachricht von {user}"
	}
};

var pushAPI = {
	subscribe: function (request, type, token, pushKey, cb) {
		return Bluebird.try(function () {
			if (type !== "android" && type !== "ios") {
				throw new Error("invalid type");
			}
		}).then(function () {
			return waterlineLoader;
		}).then(function (ontology) {
			var pushToken = ontology.collections.pushtoken;

			var givenData = {
				userID: request.session.getUserID(),
				deviceType: type,
				pushKey: pushKey,
				token: token
			};

			return pushToken.findOne({ token: token }).then(function (record) {
				if (!record) {
					console.log("CREATE: " + JSON.stringify(givenData));
					return pushToken.create(givenData);
				}

				if (record.userID !== givenData.userID || record.pushKey !== givenData.pushKey) {
					console.log("UPDATE: " + JSON.stringify(givenData));
					return pushToken.destroy({ token: token }).then(function () {
						return pushToken.create(givenData);
					});
				}
			});
		}).nodeify(cb);
	}, notifyUsers: function (users, data) {
		return Bluebird.resolve(users).map(function (user) {
			return pushAPI.notifyUser(user, data);
		});
	}, notifyUser: function (user, data) {
		return Bluebird.all([
			client.zcardAsync("topic:user:" + user.getID() + ":unreadTopics"),
			user.getLanguage()
		]).spread(function (unreadMessageCount, userLanguage) {
			if (!translations[userLanguage]) {
				console.warn("Language not found for push: " + userLanguage);
				userLanguage = "en";
			}

			return pushAPI.sendNotification(
				[user.getID()],
				data,
				unreadMessageCount,
				translations[userLanguage].title.replace("{user}", data.user)
			);
		});
	}, sendNotification: function (users, data, unreadMessageCount, title) {
		console.log("pushing to users: " + JSON.stringify(users));
		return waterlineLoader.then(function (ontology) {
			var pushToken = ontology.collections.pushtoken;

			return pushToken.find({ where: { userID: users }});
		}).map(function (user) {
			var referenceID = 0;

			if (data && data.message && data.message.meta && data.message.meta.topicid) {
				referenceID = data.message.meta.topicid;
			}

			console.log("got a user");
			return user.push(data, title, unreadMessageCount, referenceID);
		});
	}
};

module.exports = pushAPI;
