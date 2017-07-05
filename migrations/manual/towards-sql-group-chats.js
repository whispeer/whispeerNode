/* eslint-disable no-console */

"use strict";

const Bluebird = require("bluebird");
const client = require("../../includes/redisClient");
const sequelize = require("../../includes/dbConnector/sequelizeClient");

const setup = require("../../includes/setup")

const ChatChunk = require("../../includes/models/chatChunk");
const Chat = require("../../includes/models/chat");
const Message = require("../../includes/models/message")
const ChunkTitleUpdate = require("../../includes/models/chunkTitleUpdate")

const h = require("whispeerHelper")

function migrateMessage(messageID, latest) {
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
			return client.zrangeAsync(`topic:${id}:messages`, 0, -1).map(h.parseDecimal).then((messageIDs) => {
				return messageIDs.sort((a, b) =>
					a - b
				)
			}).map((messageID, index, len) => {
				return migrateMessage(messageID, index === len - 1)
			})
		})
	})
}

const migrateTopicUpdates = () => {
	return sequelize.query("SELECT * from \"topicTitleUpdates\" ORDER BY \"createdAt\" ASC", {
		type: sequelize.QueryTypes.SELECT
	}).then((topicUpdates) => {
		const latestByTopicID = {}

		topicUpdates.forEach((topicUpdate) => {
			latestByTopicID[topicUpdate.topicID] = topicUpdate
		})

		Object.keys(latestByTopicID).forEach((key) => {
			latestByTopicID[key].latest = true
		})

		return topicUpdates
	}).map((topicUpdate) => {
		const metaKeys = [
			"_parent",
			"_key",
			"_version",
			"_type",
			"_hashVersion",
			"_contentHash",
			"_ownHash",
			"_signature",
			"userID",
			"time",
		]

		const meta = {}

		metaKeys.forEach((key) => meta[key] = topicUpdate[key])

		return ChunkTitleUpdate.create({
			id: topicUpdate.id,
			ChunkId: topicUpdate.topicID,

			latest: Boolean(topicUpdate.latest),

			createdAt: topicUpdate.createdAt,
			updatedAt: topicUpdate.updatedAt,

			ct: topicUpdate.ct,
			iv: topicUpdate.iv,

			_contentHash: topicUpdate._contentHash,
			_ownHash: topicUpdate._ownHash,
			_signature: topicUpdate._signature,

			meta,
		})
	})
}

const getTopicIDs = () => {
	return client.getAsync("topic:topics").then((maximumIDString) => {
		const maximumID = parseInt(maximumIDString, 10)

		const possibleTopics = []

		for (let i = 1; i < maximumID; i += 1) {
			possibleTopics.push(i)
		}

		return possibleTopics
	}).filter((id) => {
		return client.typeAsync(`topic:${id}:meta`).then((type) => {
			return type === "hash"
		})
	}).map((id) => {
		return migrateTopic(id)
	}, { concurrency: 1 }).then(() => {
		return Bluebird.all([
			sequelize.query("select setval('\"Chats_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Messages\"));"),
			sequelize.query("select setval('\"Chunks_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Messages\"));"),
			sequelize.query("select setval('\"Messages_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Messages\"));"),
		])
	}).then(() => {
		console.log("END")
		process.exit(0)
	})
}

setup().then(() => {
	return migrateTopicUpdates()
}).then(() => {
	return getTopicIDs()
}).catch((e) => {
	console.error(e);
	process.exit(1);
})
