"use strict";

var Waterline = require("waterline");
var Bluebird = require("bluebird");

var pushService = require("../pushService");

var PushToken = Waterline.Collection.extend({
 
	// Define a custom table name 
	tableName: "pushToken",
 
	// Set schema true/false for adapters that support schemaless 
	schema: true,
	connection: "redis",
 
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
			if (this.deviceType === "android") {
				return pushService.pushAndroid(this.token, {
					title: title,
					message: "-",
					content: data,
					topicid: referenceID
				});
			} else if (this.deviceType === "ios") {
				return pushService.pushIOS(this.token, { topicid: referenceID }, title, badge);
			} else {
				return Bluebird.reject("push: invalid type");
			}
		}
	}
});

module.exports = PushToken;
