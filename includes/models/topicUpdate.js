"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");

const contentKeys = ["ct", "iv"];
const metaKeys = ["userID", "time", "_parent", "_key", "_version", "_type", "_hashVersion", "_contentHash", "_ownHash", "_signature"];

const {
	required,
	defaultValue,

	autoIncrementInteger,

	autoUUID,
	integer,
	boolean,
	key,
	hash,
	signature,
	ct,
	iv,
	timestamp,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const topicTitleUpdate = sequelize.define("topicTitleUpdate", {
	id: autoUUID(),

	index: autoIncrementInteger(),

	ct: required(ct()),
	iv: required(iv()),

	userID: required(integer()),
	time: required(timestamp()),
	_parent: Object.assign({}, required(hash()), {
		unique: false
	}),
	_key: required(key()),
	_version: required(integer()),
	_type: required({
		type: Sequelize.STRING,
		validate: { is: "topicUpdate" }
	}),
	_hashVersion: required(integer()),
	_contentHash: required(hash()),
	_ownHash: required(hash()),
	_signature: required(signature()),

	latest: defaultValue(boolean(), true),
}, {
	instanceMethods: {
		getMeta: getObject(metaKeys),
		getContent: getObject(contentKeys),
		getAPIFormatted: function () {
			return {
				id: this.id,
				topicID: this.topicID,
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

module.exports = topicTitleUpdate;
