"use strict";

const sequelize = require("../dbConnector/sequelizeClient")
const Sequelize = require("sequelize")

const Chat = require("./chat")

const {
	required,
	optional,
	defaultValue,

	autoIncrementInteger,
	integer,
	timestamp,
	key,
	hash,
	signature,
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

const mapToUserID = function (val) {
	return val.map((userID, index) => ({ userID, index }))
}

const metaKeys = [
	"creator",
	"createTime",

	"_key",
	"_version",
	"_type",
	"_contentHash",
	"_ownHash",
	"_signature",

	"_hashVersion",
	"_v2"
]

const Chunk = sequelize.define("Chunk", {
	id: autoIncrementInteger(),

	creator: required(integer()),
	createTime: required(timestamp()),

	_key: required(key()),
	_version: required(integer()),
	_type: required({
		type: Sequelize.STRING,
		validate: { isIn: [["topic", "chatChunk"]] }
	}),
	_contentHash: required(hash()),
	_ownHash: required(hash()),
	_signature: required(signature()),

	_hashVersion: optional(integer()),
	_v2: optional(boolean()),

	emptyAddedReceiver: required(boolean()),
	latest: defaultValue(boolean(), true),
	originalMeta: required(text())
}, {
	instanceMethods: {
		getMetaBase: getObject(metaKeys),
		getMeta: function () {
			const addedReceiver = this.emptyAddedReceiver ? {} : { addedReceiver: this.addedReceiver.map((u) => u.userID) }
			const predecessor = this.predecessorId ? { predecessor: this.predecessorId } : {}

			return Object.assign({}, this.getMetaBase(), {
				receiver: this.receiver.map((u) => u.userID)
			}, predecessor, addedReceiver)
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
			this.setDataValue("originalMeta", JSON.stringify(value))

			if (typeof value.addedReceiver === "undefined") {
				this.setDataValue("emptyAddedReceiver", true)
			}

			setObject(metaKeys).call(this, value)
		}
	}
}, { indexes: [ { fields: "latest" } ] })

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
	userID: required(integer()),
	index: required(integer()),
}, {
	timestamps: false,
})

const AddedReceiver = sequelize.define("AddedReceiver", {
	id: autoIncrementInteger(),
	userID: required(integer()),
	index: required(integer()),
}, {
	timestamps: false,
})

hasMany(Chunk, Receiver)
hasMany(Chunk, AddedReceiver)

Chunk.Predecessor = Chunk.belongsTo(Chunk, { as: "predecessor" })

hasMany(Chat, Chunk)

Chunk.ReceiverModel = Receiver
Chunk.AddedReceiverModel = AddedReceiver

Chunk.addScope("defaultScope", {
	include: [{
		association: Chunk.Receiver,
	}, {
		association: Chunk.AddedReceiver,
	}]
}, { override: true })

module.exports = Chunk
