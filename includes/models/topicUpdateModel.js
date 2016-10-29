"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");

const h = require("whispeerHelper");

const contentKeys = ["ct", "iv"];
const metaKeys = ["userID", "time", "_parent", "_key", "_version", "_type", "_hashVersion", "_contentHash", "_ownHash", "_signature"];

const hex = /^[0-9a-f]+$/i;
const hash = /^hash::[0-9a-f]+$/i;
const key = /^.*:[0-9a-f]+$/i;

const getObject = (objectKeys) => {
	return function() {
		const obj = {};

		objectKeys.forEach((key) => {
			obj[key] = this[key];
		});

		return obj;
	};
};

const setObject = (objectKeys, errorMessage) => {
	return function(value) {
		if (!h.arrayEqual(Object.keys(value), objectKeys)) {
			throw new Error(errorMessage);
		}

		objectKeys.forEach((key) => {
			this.setDataValue(key, value[key]);
		});
	};
};

const topicUpdate = sequelize.define("topicUpdateMeta", {
	id: {
		type: Sequelize.UUID,
		defaultValue: Sequelize.UUIDV4,
		primaryKey: true
	},
	topicId: {
		type: Sequelize.INTEGER
	},
	ct: {
		type: Sequelize.TEXT,
		validate: { is: hex }
	},
	iv: {
		type: Sequelize.STRING,
		validate: { is: hex }
	},
	userID: {
		type: Sequelize.INTEGER
	},
	time: {
		type: Sequelize.BIGINT
	},
	_parent: {
		type: Sequelize.STRING,
		validate: { is: hash }
	},
	_key: {
		type: Sequelize.STRING,
		validate: { is: key }
	},
	_version: {
		type: Sequelize.INTEGER
	},
	_type: {
		type: Sequelize.STRING,
		validate: { is: "topicUpdate" }
	},
	_hashVersion: {
		type: Sequelize.INTEGER
	},
	_contentHash: {
		type: Sequelize.STRING,
		validate: { is: hash }
	},
	_ownHash: {
		type: Sequelize.STRING,
		validate: { is: hash }
	},
	_signature: {
		type: Sequelize.STRING,
		validate: { is: hex }
	}
}, {
	instanceMethods: {
		getMeta: getObject(metaKeys),
		getContent: getObject(contentKeys)
	},
	setterMethods: {
		meta: setObject(metaKeys, "invalid meta keys"),
		content: setObject(contentKeys, "invalid content keys")
	}

});

module.exports = topicUpdate;
