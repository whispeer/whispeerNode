"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");

const Chat = require("./chat")
const Chunk = require("./chatChunk")

const contentKeys = ["ct", "iv"];
const metaKeys = ["userID", "time", "_parent", "_key", "_version", "_type", "_hashVersion", "_contentHash", "_ownHash", "_signature"];

const {
	uuid,
	requiredInteger,
	key,
	hash,
	signature,
	ct,
	iv,
} = require("./utils/columns")

const {
	getObject,
	setObject,
} = require("./utils/methods")

const topicTitleUpdate = sequelize.define("topicTitleUpdate", {
	id: uuid(),
	ct: ct(),
	iv: iv(),
	userID: requiredInteger(),
	time: {
		type: Sequelize.BIGINT,
		allowNull: false
	},
	_parent: Object.assign({}, hash(), {
		unique: false
	}),
	_key: key(),
	_version: requiredInteger(),
	_type: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: "topicUpdate" }
	},
	_hashVersion: requiredInteger(),
	_contentHash: hash(),
	_ownHash: hash(),
	_signature: signature(),
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

topicTitleUpdate.belongsTo(Chunk)
topicTitleUpdate.belongsTo(Chat)

module.exports = topicTitleUpdate;
