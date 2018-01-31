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
}, {
	classMethods: {
		isBusinessUser: (userID) =>
			CompanyUser.findAll({ where: { userID } })
				.then((companies) => companies.length > 0)
	}
})

module.exports = CompanyUser
