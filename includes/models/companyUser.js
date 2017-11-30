"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const {
	autoIncrementInteger,
	required,
	integer,
	companyRole,
} = require("./utils/columns")

const CompanyUser = sequelize.define("CompanyUser", {
	id: autoIncrementInteger(),
	userID: required(integer()),
	role: required(companyRole())
})

module.exports = CompanyUser
