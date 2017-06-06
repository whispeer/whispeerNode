"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const Chat = require("./chat")
const Message = require("./message")

const {
	autoIncrementInteger,
	required,
	integer,
} = require("./utils/columns")

const {
	hasMany
} = require("./utils/relations")

const UserUnreadMessage = sequelize.define("UserUnreadMessage", {
	id: autoIncrementInteger(),
	userID: required(integer()),
});

hasMany(Message, UserUnreadMessage)
hasMany(Chat, UserUnreadMessage)

module.exports = UserUnreadMessage;
