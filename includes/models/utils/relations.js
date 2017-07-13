"use strict"

const {
	capitaliseFirstLetter: capitalFirst,
	lowercaseFirstLetter: lowerFirst,
} = require("whispeerHelper")

module.exports = {
	hasMany: (SingleModel, ManyModel, givenOptions) => {
		const primaryKey = capitalFirst(SingleModel.primaryKeyField)
		const ManyName = lowerFirst(ManyModel.name)
		const SingleName = lowerFirst(SingleModel.name)

		const defaultOptions = {
			foreignKey: `${SingleModel.name}${primaryKey}`,
			getManyName: ManyName,
			getSingleName: SingleName
		}

		const options = Object.assign({}, defaultOptions, givenOptions)

		SingleModel[ManyModel.name] = SingleModel.hasMany(ManyModel, { as: options.getManyName, foreignKey: options.foreignKey })
		ManyModel[SingleModel.name] = ManyModel.belongsTo(SingleModel, { as: options.getSingleName, foreignKey: options.foreignKey})
	}
}
