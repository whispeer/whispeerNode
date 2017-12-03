"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const {
	autoIncrementInteger,
	required,
	text,
	integer,
	boolean,
} = require("./utils/columns")

const Company = sequelize.define("Company", {
	id: autoIncrementInteger(),
	name: required(text()),
	licenses: required(integer()),
	trial: required(boolean()),
})

module.exports = Company
