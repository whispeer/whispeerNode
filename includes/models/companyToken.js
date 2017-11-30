"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const Company = require("./company")

const {
	autoIncrementInteger,
	required,
	token,
	integer,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const CompanyToken = sequelize.define("CompanyToken", {
	id: autoIncrementInteger(),
	token: required(token()),
	uses: required(integer()),
	used: required(integer()),
})

hasMany(Company, CompanyToken)

module.exports = CompanyToken
