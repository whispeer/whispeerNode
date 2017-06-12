"use strict";

/*
Initial keys:
	topicid

Optional Keys:

*/

const sequelize = require("../dbConnector/sequelizeClient");

const {
	autoIncrementInteger,

	required,
	optional,
	unique,

	ct,
	iv,
	uuid,
	integer,
	timestamp,
	hash,
	signature,
	json,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const contentKeys = ["ct", "iv"];
const metaExtraKeys = [
	"_contentHash",
	"_ownHash",
	"_signature",

	"messageUUID",
];

const Message = sequelize.define("Message", {
	id: autoIncrementInteger(),

	ct: required(ct()),
	iv: required(iv()),

	sender: required(integer()),
	sendTime: required(timestamp()),

	_contentHash: unique(required(hash())),
	_ownHash: unique(required(hash())),
	_signature: required(signature()),

	messageUUID: unique(optional(uuid())),

	meta: required(json()),
}, {
	instanceMethods: {
		getMetaExtra: getObject(metaExtraKeys),
		getMeta: function () {
			return Object.assign({}, this.getDataValue("meta"), this.getMetaExtra())
		},
		getContent: getObject(contentKeys),
		getAPIFormatted: function () {
			return {
				server: {
					id: this.id,
					chunkID: this.ChunkId,
					chatID: this.ChatId,
					sendTime: this.getDataValue("sendTime"),
					sender: this.getDataValue("sender"),
					messageid: this.getDataValue("id"),
				},
				content: this.getContent(),
				meta: this.getMeta()
			};
		},
		hasAccess: function (request) {
			return this.getChunk().then((chunk) => chunk.hasAccess(request))
		},
		validateAccess: function (request) {
			return this.hasAccess(request).then((access) => {
				if (!access) {
					throw new AccessViolation(`No access to message ${this.id}`)
				}
			})
		},
	},
	setterMethods: {
		meta: function (value) {
			metaExtraKeys.forEach((key) => {
				this.setDataValue(key, value[key])
			})

			this.setDataValue("meta", value)
		},
		content: setObject(contentKeys)
	}
});

module.exports = Message;
