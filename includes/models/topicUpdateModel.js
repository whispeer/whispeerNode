"use strict";

var Waterline = require("waterline");

var signedSecuredObject = require("./signedSecuredObjectAttributes");
var whispeerTypes = require("./types");

var extend = require("xtend");

var TopicUpdate = Waterline.Collection.extend({
 
	// Define a custom table name 
	tableName: "topicUpdate",
 
	// Set schema true/false for adapters that support schemaless 
	schema: true,
	connection: "redis",
 
	types: whispeerTypes,

	// Define attributes for this collection 
	attributes: extend(signedSecuredObject, {
		//id of the previous message
		previousMessage: {
			type: "integer",
			min: 1,
			required: true
		},

		//sort counter
		_sortCounter: {
			type: "integer",
			min: 0,
			required: true,
			index: true
		},

		//new key or old key (but always set)
		_key: {
			type: "string",
			keyID: true,
			required: true
		},

		//new array of receiver ids
		receiver: {
			required: true,
			notEmpty: true,
			integerArray: true,
			type: "array"
		},

		//creator id
		creator: {
			type: "integer",
			min: 1,
			required: true
		},

		topicID: {
			type: "integer",
			min: 1,
			required: true,
			index: true
		},

		//topicHash for the topic
		parent: {
			type: "string",
			hex: true,
			required: true
		},

		//Used if a user has removed himself
		regenerateKey: {
			type: "boolean",
			required: false
		},


		content: {
			type: "string",
			hex: true,
			required: false
		},

		getMeta: function () {
			var meta = this.toObject();
			delete meta.content;
			return meta;			
		},

		getData: function () {
			return {
				meta: this.getMeta(),
				content: this.content
			};
		}
	})
});

module.exports = TopicUpdate;
