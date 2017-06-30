/* eslint-disable no-console */

"use strict";

const Bluebird = require("bluebird");
const client = require("../../includes/redisClient");

const setup = require("../../includes/setup")

const ChatChunk = require("../../includes/models/chatChunk");
const Chat = require("../../includes/models/chat");
const Message = require("../../includes/models/message")

const h = require("whispeerHelper")

function migrateMessage(messageID, latest) {
	console.log("Message", messageID)

	return Bluebird.all([
		client.hgetallAsync(`message:${messageID}:meta`),
		client.hgetallAsync(`message:${messageID}:content`),
	]).then(([meta, content]) => {
		const {
			sender,
			sendTime,
			messageid,
			topicid,
		} = meta

		delete meta.sender
		delete meta.sendTime
		delete meta.messageid
		delete meta.topicid

		if (meta.images) {
			meta.images = JSON.parse(meta.images)
		}

		return Message.create({
			id: messageid,
			ChunkId: topicid,
			latest,

			sender,
			sendTime,

			meta,
			content
		})
	})
}

function migrateTopic(id) {
	return Bluebird.all([
		client.hgetallAsync(`topic:${id}:meta`),
		client.hgetallAsync(`topic:${id}:receiverKeys`),
	]).then(([meta, receiverKeys]) => {
		meta.receiver = meta.receiver.split(",").map(h.parseDecimal)

		const chat = Chat.create({
			id
		})

		return chat.then(() => {
			const chunk = ChatChunk.create({
				id,
				meta,
				receiverKeys,
				ChatId: id
			}, {
				include: [{
					association: ChatChunk.Receiver,
				}]
			})

			return chunk
		}).then(() => {
			return client.zrangeAsync(`topic:${id}:messages`, 0, -1).then((messageIDs) => {
				return Bluebird.all(messageIDs.map(h.parseDecimal).sort((a, b) =>
					a - b
				).map((messageID, index) =>
					migrateMessage(messageID, index === messageIDs.length - 1)
				))
			})
		})
	})
}

function scanTopics(error, [pointer, topics]) {
	if (error) {
		console.error("Error scanning topics.")
		process.exit(1)
	}

	process.stdout.write(".")

	Bluebird.all(topics.map((key) =>
		migrateTopic(h.parseDecimal(key.split(":")[1]))
	)).then(() => {
		if (pointer !== "0") {
			client.scan(pointer, "match", "topic:*:meta", "count", 5, scanTopics)
		} else {
			console.log("END")
			process.exit(0)
		}
	})
}

setup().then(() => {
	client.scan(0, "match", "topic:*:meta", "count", 5, scanTopics)
})
