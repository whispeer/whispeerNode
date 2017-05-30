"use strict";

const sequelize = require("../dbConnector/sequelizeClient")
const Sequelize = require("sequelize")

const Chat = require("./chat")

const {
	autoIncrementInteger,
	requiredInteger,
	key,
	hash,
	signature,
} = require("./utils/columns")

const Chunk = sequelize.define("Chunk", {
	id: autoIncrementInteger,

	createTime: requiredInteger,
	receiver: requiredInteger,
	creator: requiredInteger,

	_key: key,
	_version: requiredInteger,
	_type: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { isIn: [["topic", "chatChunk"]] }
	},
	_hashVersion: requiredInteger,
	_contentHash: hash,
	_ownHash: hash,
	_signature: signature
})

Chunk.belongsTo(Chat)

module.exports = Chunk
