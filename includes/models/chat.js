"use strict";

const Bluebird = require("bluebird")

const sequelize = require("../dbConnector/sequelizeClient");

const Chunk = require("./chatChunk")

const {
	hasMany
} = require("./utils/relations")

const {
	autoIncrementInteger,
} = require("./utils/columns")

const Chat = sequelize.define("Chat", {
	id: autoIncrementInteger(),
}, {});

Chat.prototype.getLatestChunk = function () {
	const latestChunk = this.chunk && this.chunk.filter((chunk) => chunk.latest === true)[0]

	if (latestChunk) {
		return Bluebird.resolve(latestChunk)
	}

	return this.getChunk({
		where: {
			latest: true
		}
	}).then((chunks) => chunks[0])
};

Chat.prototype.getAPIFormatted = function () {
	return {
		id: this.getDataValue("id")
	}
};

Chat.prototype.hasAccess = function (request) {
	return this.getLatestChunk().then((chunk) => chunk.hasAccess(request))
};

Chat.prototype.validateAccess = function (request) {
	return this.hasAccess(request).then((access) => {
		if (!access) {
			throw new AccessViolation(`No access to chat ${this.id} for ${request.session.getUserID()}`)
		}
	})
};

Chat.prototype.markRead = function () {
	const UserUnreadMessage = require("./unreadMessage")

	return UserUnreadMessage.delete({
		where: {
			ChatId: this.id
		}
	})
};

hasMany(Chat, Chunk)

module.exports = Chat;
