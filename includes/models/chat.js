"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const {
	autoIncrementInteger,
} = require("./utils/columns")

const Chat = sequelize.define("Chat", {
	id: autoIncrementInteger(),
});

module.exports = Chat;
