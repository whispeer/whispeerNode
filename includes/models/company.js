"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const CompanyUser = require("./companyUser")

const {
	autoIncrementInteger,
	required,
	text,
	integer,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const Company = sequelize.define("Company", {
	id: autoIncrementInteger(),
	name: required(text()),
	licenses: required(integer())
})

hasMany(Company, CompanyUser)

module.exports = Company
