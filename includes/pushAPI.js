"use strict";

var step = require("step");
var h = require("whispeerHelper");

var configManager = require("./configManager");
var config = configManager.get();

var Bluebird = require("bluebird");

var client = require("./redisClient");
var errorService = require("./errorService");
var waterlineLoader = require("./models/waterlineLoader");

var pushService = require("./pushService");

waterlineLoader.then(function (ontology) {
	var pushToken = ontology.collections.pushtoken;

	pushService.listenFeedback(function (devices) {
		var tokens = devices.map(function (deviceInfo) {
			deviceInfo.token.toString("hex");
		});

		console.info("removing ios devices from database: " + JSON.stringify(tokens));

		pushToken.destroy({ token: tokens }).catch(errorService.handleError);
	});

});

var translations = {
	"en": {
		title: "New message from {user}"
	},
	"de": {
		title: "Neue Nachricht von {user}"
	}
};

function serverRequest(path, data, cb) {
	step(function () {
		var url = config.pushServerUrl + path;
		var simpleRequest = require("request");
		simpleRequest.post({
			url: url,
			json: true,
			body: data
		}, this);
	}, h.sF(function (response) {
		if (response.statusCode !== 200) {
			console.error(data);
			throw new Error("push request to " + path + " failed: " + response.statusCode);
		}

		this.ne();
	}), cb);
}

var pushAPI = {
	subscribe: function (request, type, token, cb) {
		step(function () {
			if (type !== "android" && type !== "ios") {
				throw new Error("invalid type");
			}

			waterlineLoader.then(this.ne, this);
		}, h.sF(function (ontology) {
			var pushToken = ontology.collections.pushtoken;

			var givenData = {
				userID: request.session.getUserID(),
				deviceType: type,
				token: token
			};

			pushToken.findOrCreate({ token: token }, givenData).then(this.ne, this);
		}), cb);
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
		return waterlineLoader.then(function (ontology) {
			var pushToken = ontology.collections.pushtoken;

			console.log(users);

			return pushToken.find({ userID: users });
		}).map(function (user) {
			console.log("got a user");
			return user.push(data, title, unreadMessageCount, data.message.meta.topicid);
		});

		/*
		var serverRequestAsync = Bluebird.promisify(serverRequest);

		return serverRequestAsync("/send", {
			users: users,
			android: {
				data: {
					title: title,
					message: "-",
					content: data,
					topicid: data.message.meta.topicid
				}
			},
			ios: {
				payload: {
					topicid: data.message.meta.topicid
				},
				badge: unreadMessageCount,
				alert: title
			}
		});*/
	}
};

module.exports = pushAPI;
