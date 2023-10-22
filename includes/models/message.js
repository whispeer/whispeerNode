"use strict";

const uuidv4 = require("uuid/v4");

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize")

const getPreviousMessagesSelector = (arr) => `
SELECT "oldestEarlierIDMap"."uuid" as "currentUUID", "result"."messageUUID" as "previousUUID" FROM (
	SELECT "current"."messageUUID" as "uuid", MAX("previous"."id") as "maxId"
	FROM "Messages" as "current"
	JOIN "Chunks" as "chunk" ON "chunk"."id" = "current"."ChunkId"
	JOIN "Chunks" as "chatChunks" ON "chunk"."ChatId" = "chatChunks"."ChatId"
	JOIN "Messages" as "previous" ON "previous"."ChunkId" = "chatChunks"."id" AND "previous"."id" < "current"."id"
	WHERE "current"."messageUUID" IN (${arr.map(() => "?").join(",")})
	GROUP BY "current"."messageUUID"
	ORDER BY "current"."messageUUID" ASC
) as "oldestEarlierIDMap"
JOIN "Messages" as "result" ON "result"."id" = "maxId"
`

const {
	autoIncrementInteger,

	required,
	unique,
	defaultValue,

	ct,
	iv,
	uuid,
	integer,
	timestamp,
	hash,
	signature,
	json,
	boolean,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const contentKeys = ["ct", "iv"];
const metaExtraKeys = [
	"_contentHash",
	"_ownHash",
	"_signature",
];

const Message = sequelize.define("Message", {
	id: autoIncrementInteger(),

	ct: required(ct()),
	iv: required(iv()),

	sender: required(integer()),
	sendTime: required(timestamp()),

	_contentHash: unique(required(hash())),
	_ownHash: unique(required(hash())),
	_signature: required(signature()),

	messageUUID: defaultValue(required(unique(uuid())), Sequelize.UUIDV4),

	latest: defaultValue(boolean(), true),
	latestInChunk: defaultValue(boolean(), true),

	meta: required(json()),
}, {
	setterMethods: {
		meta: function (value) {
			metaExtraKeys.forEach((key) => {
				this.setDataValue(key, value[key])
			})

			this.setDataValue("messageUUID", value.messageUUID || uuidv4())

			this.setDataValue("meta", value)
		},
		content: setObject(contentKeys)
	}
});

Message.loadPreviousMessage = function (messages) {
	return sequelize.query(getPreviousMessagesSelector(messages), {
		type: sequelize.QueryTypes.SELECT,
		replacements: messages.map((m) => m.messageUUID),
	}).then((entries) =>
		messages.forEach((message) => {
			const entry = entries.find(({ currentUUID }) => currentUUID === message.messageUUID)
			message.previousMessage = entry ? entry.previousUUID : null
		})
	)
};

Message.prototype.loadPreviousMessage = function () {
	return Message.loadPreviousMessage([this])
};

Message.prototype.getMetaExtra = getObject(metaExtraKeys);
Message.prototype.getMeta = function () {
	return Object.assign({}, this.getDataValue("meta"), this.getMetaExtra())
};
Message.prototype.getContent = getObject(contentKeys);
Message.prototype.getAPIFormatted = function (chatID) {
	if (typeof this.previousMessage === "undefined") {
		// eslint-disable-next-line no-console
		console.error("called get api formatted of message without loading previous message")
	}

	return {
		server: {
			id: this.id,
			chunkID: this.ChunkId,
			chatID,
			sendTime: this.getDataValue("sendTime"),
			sender: this.getDataValue("sender"),
			uuid: this.getDataValue("messageUUID"),
			previousMessage: this.previousMessage,
		},
		content: this.getContent(),
		meta: this.getMeta()
	};
};
Message.prototype.hasAccess = function (request) {
	return this.getChunk().then((chunk) => chunk.hasAccess(request))
};
Message.prototype.validateAccess = function (request) {
	return this.hasAccess(request).then((access) => {
		if (!access) {
			throw new AccessViolation(`No access to message ${this.id}`)
		}
	})
};

module.exports = Message;
