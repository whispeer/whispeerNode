"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize")

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
const metaKeys = ["sender", "createTime", "sendTime", "_contentHash", "_signature", "_type", "_key", "_ownHash", "_parent", "_version", "_hashVersion"];

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

	hasImages: required(boolean()),
	usesTopicReference: required(boolean()),
	originalMeta: required(text())
}, {
	instanceMethods: {
		getMeta: getObject(metaKeys),
		getContent: getObject(contentKeys),
		getAPIFormatted: function () {
			return {
				id: this.id,
				chunkID: this.ChunkId,
				chatID: this.ChatId,
				content: this.getContent(),
				meta: this.getMeta()
			};
		}
	},
	setterMethods: {
		meta: setObject(metaKeys, "invalid meta keys"),
		content: setObject(contentKeys, "invalid content keys")
	}
});

const Image = sequelize.define("Image", {
	id: autoIncrementInteger(),
	name: {
		type: Sequelize.STRING,
		allowNull: false,
	},
	index: requiredInteger()
}, {
	timestamps: false,
})

Message.hasMany(Image, { as: "images" })

hasMany(Message, Image, { getManyName: "images" })

hasMany(Chat, Message)
hasMany(Chunk, Message)

module.exports = Message;
