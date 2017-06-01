"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const Chat = require("./chat")
const Message = require("./message")

const {
	autoIncrementInteger,
	requiredInteger,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const UserUnreadMessage = sequelize.define("UserUnreadMessage", {
	id: autoIncrementInteger(),
	userID: requiredInteger()
});

hasMany(Message, UserUnreadMessage)
hasMany(Chat, UserUnreadMessage)

module.exports = UserUnreadMessage;
