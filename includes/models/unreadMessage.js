"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const Chat = require("./chat")
const Message = require("./message")

const {
	autoIncrementInteger,
	requiredInteger,
} = require("./utils/columns")

const UserUnreadMessage = sequelize.define("UserUnreadMessage", {
	id: autoIncrementInteger,
	userID: requiredInteger
});

UserUnreadMessage.hasOne(Message)
Message.hasMany(UserUnreadMessage)

UserUnreadMessage.hasOne(Chat)
Chat.hasMany(UserUnreadMessage)

module.exports = UserUnreadMessage;
