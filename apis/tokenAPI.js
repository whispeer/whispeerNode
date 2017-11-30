"use strict"

const CompanyToken = require("../includes/models/companyToken")

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
			.then(() => CompanyToken.use(token, request.session.getUserID()) )
			.then(() => ({}))
			.nodeify(fn)
	},
}
