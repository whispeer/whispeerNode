"use strict"

const Sequelize = require("sequelize")

const { hex, hash, key } = require("./validations")

module.exports = {
	required: (def) => Object.assign({}, def, { allowNull: false }),
	optional: (def) => Object.assign({}, def, { allowNull: true }),

	autoIncrementInteger: () => ({
		type: Sequelize.INTEGER,
		allowNull: false,
		autoIncrement: true,
		primaryKey: true
	}),
	autoUUID: () => ({
		type: Sequelize.UUID,
		allowNull: false,
		defaultValue: Sequelize.UUIDV4,
		primaryKey: true
	}),
	uuid: () => ({
		type: Sequelize.UUID,
	}),

	text: () => ({ type: Sequelize.TEXT }),
	integer: () => ({ type: Sequelize.INTEGER }),
	timestamp: () => ({ type: Sequelize.BIGINT, }),
	key: () => ({ type: Sequelize.STRING, validate: { is: key } }),
	hash: () => ({
		type: Sequelize.STRING,
		unique: true,
		validate: { is: hash }
	}),
	signature: () => ({
		type: Sequelize.STRING,
		unique: true,
		validate: { is: hex }
	}),
	iv: () => ({
		type: Sequelize.STRING,
		unique: true,
		validate: { is: hex }
	}),
	ct: () => ({
		type: Sequelize.TEXT,
		unique: true,
		validate: { is: hex }
	}),
	type: (type) => ({ type: Sequelize.STRING, validate: { is: type } }),
	boolean: () => ({ type: Sequelize.BOOLEAN })
}
