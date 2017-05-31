"use strict"

const h = require("whispeerHelper");

module.exports = {
	getObject: (objectKeys) => {
		return function() {
			const obj = {};

			objectKeys.forEach((key) => {
				obj[key] = this[key];
			});

			return obj;
		};
	},

	setObject: (objectKeys, errorMessage) => {
		return function(value) {
			if (!h.arrayEqual(Object.keys(value), objectKeys)) {
				throw new Error(errorMessage);
			}

			objectKeys.forEach((key) => {
				this.setDataValue(key, value[key]);
			});
		};
	}
}
