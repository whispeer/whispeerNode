"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const Company = require("./company")

const {
	autoIncrementInteger,
	required,
	integer,
	companyRole,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const CompanyUser = sequelize.define("CompanyUser", {
	id: autoIncrementInteger(),
	userID: required(integer()),
	role: required(companyRole())
})

hasMany(Company, CompanyUser)

module.exports = CompanyUser
