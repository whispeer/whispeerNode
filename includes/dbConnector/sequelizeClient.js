"use strict"

const Sequelize = require("sequelize");

module.exports = new Sequelize(
	process.env.WHISPEERDB ||
	"postgres://whispeer:whispeer@localhost/whispeer",
{
	benchmark: true,
	logging: (query, time) => {
		if (time > 50) {
			// eslint-disable-next-line no-console
			console.warn(`Slow query (${time}): ${query.replace(/\s+/g, " ").replace(/\n/g, "")}`)
		}
	}
});
