"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize")

const Chat = require("./chat")
const Chunk = require("./chunk")

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

const Message = sequelize.define("Message", {
	id: autoIncrementInteger,

	ct: ct,
	iv: iv,

	_contentHash: hash,
	topicid: requiredInteger,
	_signature: signature,
	sender: requiredInteger,
	createTime: requiredInteger,
	sendTime: requiredInteger,
	_type: type("message"),
	_key: key,
	_ownHash: hash,
	_parent: hash,
	_version: requiredInteger,
	_hashVersion: requiredInteger,
	images: {
		type: Sequelize.STRING,
		allowNull: true,
	}
});

Message.belongsTo(Chat)
Message.belongsTo(Chunk)

module.exports = Message;
