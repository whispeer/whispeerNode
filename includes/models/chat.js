"use strict";

const Bluebird = require("bluebird")

const sequelize = require("../dbConnector/sequelizeClient");

const Chunk = require("./chatChunk")
const Message = require("./message")
const topicTitleUpdate = require("./topicUpdate")

const {
	hasMany
} = require("./utils/relations")

const {
	autoIncrementInteger,
} = require("./utils/columns")

const Chat = sequelize.define("Chat", {
	id: autoIncrementInteger(),
}, {
	instanceMethods: {
		getLatestChunk: function () {
			const latestChunk = this.chunk && this.chunk.filter((chunk) => chunk.latest === true)[0]

			if (latestChunk) {
				return Bluebird.resolve(latestChunk)
			}

			return this.getChunk({
				where: {
					latest: true
				}
			}).then((chunks) => chunks[0])
		},
		getAPIFormatted: function () {
			return {
				id: this.getDataValue("id"),
				chunks: this.chunk.map((chunk) => chunk.getAPIFormatted())
			}
		},
		hasAccess: function (request) {
			return this.getLatestChunk().then((chunk) => chunk.hasAccess(request))
		},
		validateAccess: function (request) {
			return this.hasAccess(request).then((access) => {
				if (!access) {
					throw new AccessViolation(`No access to chat ${this.id}`)
				}
			})
		},
		markRead: function () {
			const UserUnreadMessage = require("./unreadMessage")

			return UserUnreadMessage.delete({
				where: {
					ChatId: this.id
				}
			})
		}
	}
});

hasMany(Chat, Chunk)
hasMany(Chat, topicTitleUpdate)
hasMany(Chat, Message)

Chat.addScope("defaultScope", {
	include: [{
		association: Chat.Chunk,
		where: {
			latest: true
		}
	}]
}, { override: true })

module.exports = Chat;
