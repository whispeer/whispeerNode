"use strict";

const Bluebird = require("bluebird");
const client = require("../includes/redisClient");

const sequelize = require("../includes/dbConnector/sequelizeClient");
require("../includes/models/companyUser");
const Company = require("../includes/models/company");

const createCompany = (company) =>
	Company.create(company, {
		include: [{
			association: Company.CompanyUser,
		}]
	})

const getAllCompanies = () =>
	client.smembersAsync("user:list")
		.map((userID) => client.smembersAsync(`user:${userID}:companies`)
			.then((companies) => ({ companies, userID }))
		)
		.filter((info) => info.companies.length > 0)
		.then((userCompanies) => {
			const companies = {}

			userCompanies.forEach((info) => {
				info.companies.forEach((name) => {
					if (!companies[name]) {
						companies[name] = { companyUser: [], name, licenses: 9001, trial: true }
					}

					companies[name].companyUser.push({ userID: info.userID, role: "admin" })
				})
			})

			return Object.keys(companies).map((key) => companies[key])
		})


function addCompaniesToPostgres(cb) {
	return Bluebird.resolve().then(() =>
		sequelize.sync()
	).then(() =>
		getAllCompanies()
	).map((company) =>
		createCompany(company)
	).nodeify(cb);
}

module.exports = addCompaniesToPostgres;
