"use strict"

const Bluebird = require("bluebird")

const CompanyToken = require("../includes/models/companyToken")
const CompanyUser = require("../includes/models/companyUser")
const sequelize = require("../includes/dbConnector/sequelizeClient");

module.exports = {
	get: ({ token }, fn) => {
		return CompanyToken.findOne({ where: { token }}).then((dbToken) => {
			if (!dbToken) {
				throw new Error("Token invalid")
			}

			return {
				companyID: dbToken.CompanyId
			}
		}).nodeify(fn)
	},
	use: ({ token }, fn, request) => {
		return request.session.logedinError()
			.then(() => {
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

							const userID = request.session.getUserID()

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
			}).nodeify(fn)
	},
}
