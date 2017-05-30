"use strict"

const Sequelize = require("sequelize");

module.exports = new Sequelize(
	process.env.WHISPEERDB ||
	"postgres://whispeer:whispeer@localhost/whispeer"
);
