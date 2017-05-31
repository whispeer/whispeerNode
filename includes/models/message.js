"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize")

const Chat = require("./chat")
const Chunk = require("./chatChunk")

const {
	autoIncrementInteger,
	requiredInteger,
	key,
	hash,
	signature,
	ct,
	iv,
	type
} = require("./utils/columns")

const Image = sequelize.define("Image", {
	id: autoIncrementInteger(),
	name: {
		type: Sequelize.STRING,
		allowNull: false,
	}
}, {
	timestamps: false,
})

const Message = sequelize.define("Message", {
	id: autoIncrementInteger(),

	ct: ct(),
	iv: iv(),

	_contentHash: hash(),
	_signature: signature(),
	sender: requiredInteger(),
	createTime: requiredInteger(),
	sendTime: requiredInteger(),
	_type: type("message"),
	_key: key(),
	_ownHash: hash(),
	_parent: hash(),
	_version: requiredInteger(),
	_hashVersion: requiredInteger()
});

Message.hasMany(Image, { as: "images" })

Chat.hasMany(Message)
Chunk.hasMany(Message)

module.exports = Message;
