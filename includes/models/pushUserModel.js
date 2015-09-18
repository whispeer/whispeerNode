"use strict";

var Waterline = require("waterline");
var Bluebird = require("bluebird");

var pushService = require("../pushService");
var errorService = require("../errorService");

var PushKey = Waterline.Collection.extend({
 
	// Define a custom table name 
	tableName: "pushToken",
 
	// Set schema true/false for adapters that support schemaless 
	schema: true,
 
	// Define an adapter to use 
	adapter: "redis",
 
	// Define attributes for this collection 
	attributes: {
		userID: {
			type: "integer",
			required: true,
			index: true
		},

		deviceType: {
			type: "string",
			required: true
		},

		token: {
			type: "string",
			required: true,
			unique: true
		},

		push: function (data, title, badge, referenceID) {
			if (this.type === "android") {
				pushService.pushAndroid({
					title: title,
					message: "-",
					content: data,
					topicid: referenceID
				});
			} else if (this.type === "ios") {
				pushService.pushIOS({ referenceID: referenceID }, title, badge);
			} else {
				return Bluebird.reject("push: invalid type");
			}
		}
	}
});

pushService.listenFeedback(function (devices) {
	var tokens = devices.map(function (deviceInfo) {
		deviceInfo.token.toString("hex");
	});

	PushKey.findByTokenIn(tokens).map(function (obj) {
		return obj.destroy();
	}).catch(errorService.handleError);
});

module.exports = PushKey;
