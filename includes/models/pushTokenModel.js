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

		pushKey: {
			type: "string",
			required: false,
			unique: false
		},

		push: function (data, title, badge, referenceID) {
			if (this.deviceType === "android") {
				var androidData = {
					topicid: referenceID,
					vibrationPattern: [0, 400, 500, 400],
					ledColor: [0, 0, 255, 0]
				};

				if (title) {
					androidData.title = title;
					androidData.message = "-";
				}

				if (this.pushKey) {
					var sjcl = require("../crypto/sjcl");
					console.log("Using key: " + this.pushKey);
					androidData.encryptedContent = sjcl.encrypt(sjcl.codec.hex.toBits(this.pushKey), JSON.stringify(data));
				} else {
					androidData.content = data;
				}

				return pushService.pushAndroid(this.token, androidData);
			} else if (this.deviceType === "ios") {
				return pushService.pushIOS(this.token, { topicid: referenceID }, title, badge);
			} else {
				return Bluebird.reject("push: invalid type");
			}
		}
	}
});

module.exports = PushToken;
