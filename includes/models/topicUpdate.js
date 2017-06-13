"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const contentKeys = ["ct", "iv"];
const metaKeys = [
	"userID",
	"_contentHash",
	"_ownHash",
	"_signature"
];

const {
	required,
	defaultValue,
	unique,

	autoIncrementInteger,

	autoUUID,
	integer,
	boolean,
	hash,
	signature,
	ct,
	iv,
	json,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const chunkTitleUpdate = sequelize.define("chunkTitleUpdate", {
	id: autoUUID(),

	index: autoIncrementInteger(),

	ct: required(ct()),
	iv: required(iv()),

	userID: required(integer()),

	_contentHash: unique(required(hash())),
	_ownHash: unique(required(hash())),
	_signature: required(signature()),

	meta: required(json()),

	latest: defaultValue(boolean(), true),
}, {
	instanceMethods: {
		getMeta: getObject(metaKeys),
		getContent: getObject(contentKeys),
		getAPIFormatted: function () {
			return {
				server: {
					id: this.id,
					chunkID: this.chunkID,
				},
				content: this.getContent(),
				meta: this.getMeta()
			};
		}
	},
	setterMethods: {
		meta: setObject(metaKeys, "invalid meta keys"),
		content: setObject(contentKeys, "invalid content keys")
	}
});

module.exports = chunkTitleUpdate;
