"use strict";

const sequelize = require("../dbConnector/sequelizeClient")

const CompanyUser = require("./companyUser")

const {
	autoIncrementInteger,
	required,
	text,
	integer,
	boolean,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const Company = sequelize.define("Company", {
	id: autoIncrementInteger(),
	name: required(text()),
	licenses: required(integer()),
	trial: required(boolean()),
}, {
	instanceMethods: {
		hasAccess: function (uID) {
			if (!this.companyUser) {
				throw new AccessViolation(`No access to company ${this.id} for ${uID}`)
			}

			return !!this.companyUser.find(({ userID }) => uID === userID)
		},
		validateAccess: function (uID) {
			if (!this.hasAccess(uID)) {
				throw new AccessViolation(`No access to company ${this.id} for ${uID}`)
			}
		},
	}
})

hasMany(Company, CompanyUser)

Company.addScope("defaultScope", {
	include: [{
		association: Company.CompanyUser,
	}]
}, { override: true })

module.exports = Company
