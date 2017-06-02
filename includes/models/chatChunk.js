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
	requiredBoolean,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const {
	hasMany
} = require("./utils/relations")

const mapToUserID = function (val) {
	return val.map((userID, index) => ({ userID, index }))
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

	emptyAddedReceiver: requiredBoolean()
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
		}
	}
})

Chunk.sequelizeCreate = Chunk.create

Chunk.create = (values, allowedFields) => {
	if (!values.meta) {
		return Chunk.sequelizeCreate(values, allowedFields)
	}

	const {
		addedReceiver,
		receiver,
		predecessor: predecessorId
	} = values.meta

	delete values.meta.addedReceiver
	delete values.meta.receiver
	delete values.meta.predecessor

	values.emptyAddedReceiver = typeof addedReceiver === "undefined"

	const newValues = Object.assign({}, values, {
		receiver: mapToUserID(receiver),
	})

	if (predecessorId) {
		newValues.predecessorId = predecessorId
	}

	if (addedReceiver) {
		newValues.addedReceiver = mapToUserID(addedReceiver)
	}

	return Chunk.sequelizeCreate(newValues, allowedFields)
}

const Receiver = sequelize.define("Receiver", {
	id: autoIncrementInteger(),
	userID: requiredInteger(),
	index: requiredInteger(),
}, {
	timestamps: false,
})

const AddedReceiver = sequelize.define("AddedReceiver", {
	id: autoIncrementInteger(),
	userID: requiredInteger(),
	index: requiredInteger(),
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
