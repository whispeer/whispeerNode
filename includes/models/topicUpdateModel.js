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

const topicTitleUpdate = sequelize.define("topicTitleUpdate", {
	id: {
		type: Sequelize.UUID,
		allowNull: false,
		defaultValue: Sequelize.UUIDV4,
		primaryKey: true
	},
	topicID: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	ct: {
		type: Sequelize.TEXT,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	},
	iv: {
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	},
	userID: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	time: {
		type: Sequelize.BIGINT,
		allowNull: false
	},
	_parent: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: hash }
	},
	_key: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: key }
	},
	_version: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	_type: {
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: "topicUpdate" }
	},
	_hashVersion: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	_contentHash: {
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hash }
	},
	_ownHash: {
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hash }
	},
	_signature: {
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	}
}, {
	instanceMethods: {
		getMeta: getObject(metaKeys),
		getContent: getObject(contentKeys),
		getAPIFormatted: function () {
			return {
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
