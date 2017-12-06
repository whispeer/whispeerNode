"use strict"

const Company = require("../includes/models/company")
const CompanyUser = require("../includes/models/companyUser")

const getCompanyAndValidateAccess = (id, userID) => {
	return Company.findById(id)
		.then((company) => {
			if (!company) {
				throw new AccessViolation(`No access to company ${id}`)
			}

			company.validateAccess(userID)
			return company
		})
}

const companyAPI = {
	ownCompanyID: (data, fn, request) => {
		return CompanyUser.findOne({ where: { userID: request.session.getUserID() }})
			.then((companyUser) => companyUser ? { companyID: companyUser.CompanyId } : {})
			.nodeify(fn)
	},
	get: ({ id }, fn, request) => {
		return getCompanyAndValidateAccess(id, request.session.getUserID())
			.then(({ id, name, companyUser }) => ({
				company: {
					id,
					name,
					userIDs: companyUser.map(({ userID }) => userID)
				}
			}))
			.nodeify(fn)
	}
}

module.exports = companyAPI
