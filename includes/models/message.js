"use strict";

/*
Initial keys:
	topicid

Optional Keys:

*/

const sequelize = require("../dbConnector/sequelizeClient");

const Chat = require("./chat")
const Chunk = require("./chatChunk")

const {
	autoIncrementInteger,

	required,
	optional,

	uuid,
	integer,
	timestamp,
	key,
	hash,
	signature,
	ct,
	iv,
	type,
	boolean,
	text,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const {
	hasMany
} = require("./utils/relations")

const contentKeys = ["ct", "iv"];
const metaKeys = [
	"createTime",

	"_contentHash",
	"_signature",
	"_type",
	"_key",
	"_ownHash",
	"_parent",
	"_version",

	"_sortCounter",
	"messageUUID",
	"_hashVersion",
	"_v2",
];

const Message = sequelize.define("Message", {
	id: autoIncrementInteger(),

	ct: required(ct()),
	iv: required(iv()),

	sender: required(integer()),
	createTime: required(timestamp()),
	sendTime: required(timestamp()),

	_contentHash: required(hash()),
	_signature: required(signature()),
	_type: required(type("message")),
	_key: required(key()),
	_ownHash: required(hash()),
	_parent: required(hash()),
	_version: required(integer()),

	_sortCounter: optional(integer()),
	messageUUID: optional(uuid()),
	_hashVersion: optional(integer()),
	_v2: optional(boolean()),

	images: optional(text()),
	originalMeta: required(text()),
}, {
	instanceMethods: {
		getMetaBase: getObject(metaKeys),
		getMeta: function () {
			const meta = this.getMetaBase()

			const imagesJSON = this.getDataValue("images")

			const images = imagesJSON ? JSON.parse(imagesJSON) : ""

			return Object.assign({}, meta, { images })
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
			this.setDataValue("originalMeta", JSON.stringify(value))

			if (value.images) {
				this.setDataValue("images", JSON.stringify(value.images))
				delete value.images
			}

			setObject(metaKeys).call(this, value)
		},
		content: setObject(contentKeys)
	}
});

hasMany(Chat, Message)
hasMany(Chunk, Message)

module.exports = Message;
