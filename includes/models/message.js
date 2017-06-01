"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize")

const Chat = require("./chat")
const Chunk = require("./chatChunk")

const {
	autoIncrementInteger,
	requiredInteger,
	requiredTimestamp,
	key,
	hash,
	signature,
	ct,
	iv,
	type
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

	ct: ct(),
	iv: iv(),

	sender: requiredInteger(),
	createTime: requiredTimestamp(),
	sendTime: requiredTimestamp(),

	_contentHash: hash(),
	_signature: signature(),
	_type: type("message"),
	_key: key(),
	_ownHash: hash(),
	_parent: hash(),
	_version: requiredInteger(),
	_hashVersion: requiredInteger()
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
	}
}, {
	timestamps: false,
})

Message.hasMany(Image, { as: "images" })

hasMany(Message, Image, { getManyName: "images" })

hasMany(Chat, Message)
hasMany(Chunk, Message)

module.exports = Message;
