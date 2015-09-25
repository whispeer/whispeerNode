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
			if (this.type === "android") {
				return pushService.pushAndroid({
					title: title,
					message: "-",
					content: data,
					topicid: referenceID
				});
			} else if (this.type === "ios") {
				return pushService.pushIOS({ referenceID: referenceID }, title, badge);
			} else {
				return Bluebird.reject("push: invalid type");
			}
		}
	}
});

module.exports = PushToken;
