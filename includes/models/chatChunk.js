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

const {
	hasMany
} = require("./utils/relations")

const mapToUserID = function (val) {
	if (typeof val === "number") {
		return val.map((userID) => ({ userID }))
	}

	return val
}

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
			return Object.assign({}, this.getMetaBase(), {
				addedReceiver: this.addedReceiver.map((u) => u.userID),
				receiver: this.receiver.map((u) => u.userID),
				predecessor: this.predecessorId
			})
		},
		getAPIFormatted: function () {
			return {
				id: this.id,
				meta: this.getMeta()
			};
		}
	},
	setterMethods: {
		meta: function (value) {
			setObject(metaKeys, "invalid meta keys").call(this, value)
		},
		receiver: mapToUserID,
		addedReceiver: mapToUserID
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

hasMany(Chunk, Receiver)
hasMany(Chunk, AddedReceiver)

Chunk.Predecessor = Chunk.belongsTo(Chunk, { as: "predecessor" })

hasMany(Chat, Chunk)

Chunk.addScope("defaultScope", {
	include: [{
		association: Chunk.Receiver,
	}, {
		association: Chunk.AddedReceiver,
	}]
}, { override: true })

module.exports = Chunk
