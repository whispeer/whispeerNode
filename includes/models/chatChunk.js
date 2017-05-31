"use strict";

const sequelize = require("../dbConnector/sequelizeClient")
const Sequelize = require("sequelize")

const Chat = require("./chat")

const {
	autoIncrementInteger,
	requiredInteger,
	requiredTimestamp,
	key,
	hash,
	signature,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const metaKeys = ["creator", "createTime", "_key", "_version", "_type", "_hashVersion", "_contentHash", "_ownHash", "_signature"];

const Chunk = sequelize.define("Chunk", {
	id: autoIncrementInteger(),

	createTime: requiredTimestamp(),
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
}, {
	instanceMethods: {
		getMetaBase: getObject(metaKeys),
		getMeta: function () {
			debugger
			return Object.assign({}, this.getMetaBase(), {
				addedReceiver: this.addedReceiver.map((u) => u.userID),
				receiver: this.receiver.map((u) => u.userID)
			})
		},
		getAPIFormatted: function () {
			return {
				id: this.id,
				meta: this.getMeta()
			};
		}
	}
})

const Receiver = sequelize.define("Receiver", {
	id: autoIncrementInteger(),
	userID: requiredInteger()
}, {
	timestamps: false,
})

const AddedReceiver = sequelize.define("AddedReceiver", {
	id: autoIncrementInteger(),
	userID: requiredInteger()
}, {
	timestamps: false,
})

Chunk.Receiver = Chunk.hasMany(Receiver, { as: "receiver" })
Chunk.AddedReceiver = Chunk.hasMany(AddedReceiver, { as: "addedReceiver" })

Chunk.Successor = Chunk.belongsTo(Chunk, { foreignKey: "successor" })

Chat.hasMany(Chunk)

module.exports = Chunk
