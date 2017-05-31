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
	id: autoIncrementInteger(),

	createTime: requiredInteger(),
	creator: requiredInteger(),

	_key: key(),
	_version: requiredInteger(),
	_type: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { isIn: [["topic", "chatChunk"]] }
	},
	_hashVersion: requiredInteger(),
	_contentHash: hash(),
	_ownHash: hash(),
	_signature: signature(),
})

const Receiver = sequelize.define("Receiver", {
	id: autoIncrementInteger(),
	userID: requiredInteger()
}, {
	timestamps: false,
})

Chunk.hasMany(Receiver, { as: "receiver" })

Chunk.belongsTo(Chunk, { foreignKey: "successor" })

Chat.hasMany(Chunk)

module.exports = Chunk
