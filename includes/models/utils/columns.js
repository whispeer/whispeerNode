"use strict"

const Sequelize = require("sequelize")

const { hex, hash, key } = require("./validations")

module.exports = {
	autoIncrementInteger: () => ({
		type: Sequelize.INTEGER,
		allowNull: false,
		autoIncrement: true,
		primaryKey: true
	}),
	uuid: () => ({
		type: Sequelize.UUID,
		allowNull: false,
		defaultValue: Sequelize.UUIDV4,
		primaryKey: true
	}),
	requiredInteger: () => ({
		type: Sequelize.INTEGER,
		allowNull: false
	}),
	requiredTimestamp: () => ({
		type: Sequelize.BIGINT,
		allowNull: false
	}),
	key: () => ({
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: key }
	}),
	hash: () => ({
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hash }
	}),
	signature: () => ({
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	}),
	iv: () => ({
		type: Sequelize.STRING,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	}),
	ct: () => ({
		type: Sequelize.TEXT,
		allowNull: false,
		unique: true,
		validate: { is: hex }
	}),
	type: (type) => ({
		type: Sequelize.STRING,
		allowNull: false,
		validate: { is: type }
	}),
	requiredBoolean: () => ({
		type: Sequelize.BOOLEAN,
		allowNull: false,
	})
}
