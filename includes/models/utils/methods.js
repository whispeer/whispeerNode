"use strict"

const h = require("whispeerHelper");

module.exports = {
	getObject: (objectKeys) => {
		return function() {
			const obj = {};

			objectKeys.forEach((key) => {
				const value = this.getDataValue(key)

				if (value) {
					obj[key] = value
				}
			});

			return obj;
		};
	},

	setObject: (objectKeys) => {
		return function(value) {
			objectKeys.forEach((key) => {
				if (value[key]) {
					this.setDataValue(key, value[key])
				}
			})
		};
	}
}
