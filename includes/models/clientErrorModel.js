"use strict";

const sequelize = require("../dbConnector/sequelizeClient");
const Sequelize = require("sequelize");

const clientError = sequelize.define("clientError", {
	id: {
		type: Sequelize.INTEGER,
		allowNull: false,
		autoIncrement: true,
		primaryKey: true
	},
	errorText: {
		type: Sequelize.STRING(510),
		allowNull: false,
	},
	errorStack: {
		type: Sequelize.TEXT,
		allowNull: true,
	},
	headers: {
		type: Sequelize.TEXT,
		allowNull: false
	},
	mailSent: {
		type: Sequelize.BOOLEAN
	}
}, {});

module.exports = clientError;
