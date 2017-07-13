"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const contentKeys = ["ct", "iv"];
const metaExtraKeys = [
	"_contentHash",
	"_ownHash",
	"_signature"
];

const {
	required,
	defaultValue,
	unique,

	autoUUID,
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

const chunkTitleUpdate = sequelize.define("ChunkTitleUpdate", {
	id: autoUUID(),

	ct: required(ct()),
	iv: required(iv()),

	_contentHash: unique(required(hash())),
	_ownHash: unique(required(hash())),
	_signature: unique(required(signature())),

	meta: required(json()),

	latest: defaultValue(boolean(), true),
}, {
	instanceMethods: {
		getMetaExtra: getObject(metaExtraKeys),
		getMeta: function () {
			return Object.assign({}, this.getMetaExtra(), this.getDataValue("meta"))
		},
		getContent: function () {
			return {
				ct: this.getDataValue("ct"),
				iv: this.getDataValue("iv"),
			}
		},
		getAPIFormatted: function () {
			return {
				server: {
					id: this.id,
					chunkID: this.ChunkId,
				},
				content: this.getContent(),
				meta: this.getMeta()
			};
		}
	},
	setterMethods: {
		meta: function (value) {
			metaExtraKeys.forEach((key) => {
				this.setDataValue(key, value[key])
			})

			this.setDataValue("meta", value)
		},
		content: setObject(contentKeys, "invalid content keys")
	}
});

module.exports = chunkTitleUpdate;
