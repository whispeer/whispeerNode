"use strict";

const h = require("whispeerHelper")

const sequelize = require("../dbConnector/sequelizeClient")

const Bluebird = require("bluebird")

const Message = require("./message")
const chunkTitleUpdate = require("./chunkTitleUpdate")

const {
	required,
	optional,

	defaultValue,

	unique,

	autoIncrementInteger,
	ct,
	iv,
	integer,
	json,
	key,
	hash,
	signature,
	boolean,
} = require("./utils/columns")

const {
	getObject
} = require("./utils/methods")

const {
	hasMany
} = require("./utils/relations")

const metaExtraKeys = [
	"_ownHash",
	"_signature",
]

const Chunk = sequelize.define("Chunk", {
	id: autoIncrementInteger(),

	_ownHash: unique(required(hash())),
	_signature: required(signature()),

	ct: optional(ct()),
	iv: optional(iv()),

	meta: required(json()),

	latest: defaultValue(boolean(), true),
}, {
	setterMethods: {
		meta: function (value) {
			metaExtraKeys.forEach((key) => {
				this.setDataValue(key, value[key])
			})

			this.setDataValue("meta", value)
		},
		content: function (value) {
			if (value) {
				this.setDataValue("ct", value.ct)
				this.setDataValue("iv", value.iv)
			}
		}
	}
}, { indexes: [ { fields: "latest" } ] })

Chunk.prototype.getMetaExtra = getObject(metaExtraKeys);

Chunk.prototype.getMeta = function () {
	return Object.assign({}, this.getMetaExtra(), this.getDataValue("meta"))
};

Chunk.prototype.getLatestChunkTitleUpdate = function () {
	if (!this.chunkTitleUpdate || !this.latest) {
		return
	}

	const latest = this.chunkTitleUpdate.find((c) => c.latest)

	if (!latest) {
		return
	}

	return latest.getAPIFormatted()
};

Chunk.prototype.getAPIFormatted = function () {
	const latestTitleUpdate = this.getLatestChunkTitleUpdate()

	const contentInfo = this.hasContent() ? { content: this.getContent() } : {}
	const latestTitleInfo = latestTitleUpdate ? { latestTitleUpdate } : {}

	return Object.assign({
		server: {
			id: this.id,
			chatID: this.ChatId,
			predecessorID: this.predecessorId
		},
		meta: this.getMeta(),
	}, contentInfo, latestTitleInfo)
};

Chunk.prototype.hasAccess = function (request) {
	const receiverPromise = this.receiver || this.getReceiver()

	return Bluebird.resolve(receiverPromise).then((receiver) =>
		receiver.some((receiver) => request.session.isMyID(receiver.userID))
	)
};

Chunk.prototype.validateAccess = function (request) {
	return this.hasAccess(request).then((access) => {
		if (!access) {
			throw new AccessViolation(`No access to chunk ${this.id}`)
		}
	})
};

Chunk.prototype.isAdmin = function (userID) {
	if (this.meta.admins) {
		return this.meta.admins.indexOf(userID) !== -1
	}

	return h.parseDecimal(this.getDataValue("meta").creator) === h.parseDecimal(userID)
};

Chunk.prototype.hasContent = function () {
	return Boolean(this.getDataValue("ct")) && Boolean(this.getDataValue("iv"))
};

Chunk.prototype.getContent = function () {
	return {
		ct: this.getDataValue("ct"),
		iv: this.getDataValue("iv"),
	}
};

Chunk.sequelizeCreate = Chunk.create

Chunk.create = (values, options) => {
	if (!values.meta) {
		return Chunk.sequelizeCreate(values, options)
	}

	const receiverKeys = values.receiverKeys || {}

	const receiver = values.meta.receiver.map((userID) => ({ userID, key: receiverKeys[userID] }))

	const newValues = Object.assign({}, values, {
		receiver,
		userWithAccess: receiver
	})

	return Chunk.sequelizeCreate(newValues, options)
}

const Receiver = sequelize.define("Receiver", {
	id: autoIncrementInteger(),
	key: optional(key()),
	userID: required(integer()),
}, {
	timestamps: false,
})

const UserWithAccess = sequelize.define("UserWithAccess", {
	id: autoIncrementInteger(),
	userID: required(integer()),
}, {
	timestamps: false,
})

hasMany(Chunk, Receiver)
hasMany(Chunk, UserWithAccess)
hasMany(Chunk, chunkTitleUpdate)
hasMany(Chunk, Message)

Chunk.Predecessor = Chunk.belongsTo(Chunk, { as: "predecessor" })

Chunk.ReceiverModel = Receiver

Chunk.addScope("defaultScope", {
	include: [{
		association: Chunk.Receiver,
	}]
}, { override: true })


module.exports = Chunk
