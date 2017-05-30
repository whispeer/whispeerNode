"use strict";

const sequelize = require("../dbConnector/sequelizeClient");

const Chat = require("./chat")
const Message = require("./message")

const {
	autoIncrementInteger,
	requiredInteger,
} = require("./utils/columns")

const UnreadMessage = sequelize.define("UnreadMessage", {
	id: autoIncrementInteger,
	userID: requiredInteger
});

UnreadMessage.belongsTo(Message)
UnreadMessage.belongsTo(Chat)

module.exports = UnreadMessage;
