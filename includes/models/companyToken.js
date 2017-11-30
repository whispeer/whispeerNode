"use strict";

const Bluebird = require("bluebird")

const sequelize = require("../dbConnector/sequelizeClient")

const Company = require("./company")
const CompanyUser = require("./companyUser")

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

CompanyToken.use = (token, userID) => {
	return sequelize.transaction((transaction) => {
		return CompanyToken.findOne({ where: { token }}, { transaction })
			.then((dbToken) => {
				if (!dbToken) {
					throw new Error("Token invalid")
				}

				const { uses, used, CompanyId } = dbToken

				if (uses <= used) {
					throw new Error("Token invalid")
				}

				console.log(`add ${userID} to company ${CompanyId} via token ${token}`)

				dbToken.used = dbToken.used + 1

				return sequelize.transaction((transaction) => {
					return Bluebird.all([
						CompanyUser.create({ userID, CompanyId }, { transaction }),
						dbToken.save({ transaction })
					])
				})
			})
	})
}

hasMany(Company, CompanyToken)

module.exports = CompanyToken
