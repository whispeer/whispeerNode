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

const ADD_CONSTRAINTS = `
	ALTER TABLE ONLY "Chats"
		ADD CONSTRAINT "Chats_pkey" PRIMARY KEY (id);

	ALTER TABLE ONLY "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates_pkey" PRIMARY KEY (id);

	ALTER TABLE ONLY "Chunks"
		ADD CONSTRAINT "Chunks_pkey" PRIMARY KEY (id);

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages_pkey" PRIMARY KEY (id);

	ALTER TABLE ONLY "Receivers"
		ADD CONSTRAINT "Receivers_pkey" PRIMARY KEY (id);

	ALTER TABLE ONLY "UserWithAccesses"
		ADD CONSTRAINT "UserWithAccesses_pkey" PRIMARY KEY (id);

	ALTER TABLE "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates_ChunkId_fkey" FOREIGN KEY ("ChunkId") REFERENCES "Chunks"(id) ON UPDATE CASCADE ON DELETE SET NULL;

	ALTER TABLE "Chunks"
		ADD CONSTRAINT "Chunks_ChatId_fkey" FOREIGN KEY ("ChatId") REFERENCES "Chats"(id) ON UPDATE CASCADE ON DELETE SET NULL;

	ALTER TABLE "Chunks"
		ADD CONSTRAINT "Chunks_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Chunks"(id) ON UPDATE CASCADE ON DELETE SET NULL;

	ALTER TABLE "Messages"
		ADD CONSTRAINT "Messages_ChunkId_fkey" FOREIGN KEY ("ChunkId") REFERENCES "Chunks"(id) ON UPDATE CASCADE ON DELETE SET NULL;

	ALTER TABLE "Receivers"
		ADD CONSTRAINT "Receivers_ChunkId_fkey" FOREIGN KEY ("ChunkId") REFERENCES "Chunks"(id) ON UPDATE CASCADE ON DELETE SET NULL;

	ALTER TABLE ONLY "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates__contentHash_key" UNIQUE ("_contentHash");

	ALTER TABLE ONLY "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates__ownHash_key" UNIQUE ("_ownHash");

	ALTER TABLE ONLY "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates__signature_key" UNIQUE (_signature);

	ALTER TABLE ONLY "ChunkTitleUpdates"
		ADD CONSTRAINT "ChunkTitleUpdates_iv_key" UNIQUE (iv);

	ALTER TABLE ONLY "Chunks"
		ADD CONSTRAINT "Chunks__ownHash_key" UNIQUE ("_ownHash");

	ALTER TABLE ONLY "Chunks"
		ADD CONSTRAINT "Chunks__signature_key" UNIQUE (_signature);

	ALTER TABLE ONLY "Chunks"
		ADD CONSTRAINT "Chunks_iv_key" UNIQUE (iv);

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages__contentHash_key" UNIQUE ("_contentHash");

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages__ownHash_key" UNIQUE ("_ownHash");

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages__signature_key" UNIQUE (_signature);

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages_iv_key" UNIQUE (iv);

	ALTER TABLE ONLY "Messages"
		ADD CONSTRAINT "Messages_messageUUID_key" UNIQUE ("messageUUID");
`

const REMOVE_CONSTRAINTS = `
	ALTER TABLE "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates_ChunkId_fkey";

	ALTER TABLE "Chunks"
		DROP CONSTRAINT "Chunks_ChatId_fkey";

	ALTER TABLE "Chunks"
		DROP CONSTRAINT "Chunks_predecessorId_fkey";

	ALTER TABLE "Messages"
		DROP CONSTRAINT "Messages_ChunkId_fkey";

	ALTER TABLE "Receivers"
		DROP CONSTRAINT "Receivers_ChunkId_fkey";

	ALTER TABLE ONLY "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates__contentHash_key";

	ALTER TABLE ONLY "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates__ownHash_key";

	ALTER TABLE ONLY "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates__signature_key";

	ALTER TABLE ONLY "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates_iv_key";

	ALTER TABLE ONLY "Chunks"
		DROP CONSTRAINT "Chunks__ownHash_key";

	ALTER TABLE ONLY "Chunks"
		DROP CONSTRAINT "Chunks__signature_key";

	ALTER TABLE ONLY "Chunks"
		DROP CONSTRAINT "Chunks_iv_key";

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages__contentHash_key";

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages__ownHash_key";

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages__signature_key";

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages_iv_key";

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages_messageUUID_key";

	ALTER TABLE ONLY "Chats"
		DROP CONSTRAINT "Chats_pkey" CASCADE;

	ALTER TABLE ONLY "ChunkTitleUpdates"
		DROP CONSTRAINT "ChunkTitleUpdates_pkey" CASCADE;

	ALTER TABLE ONLY "Chunks"
		DROP CONSTRAINT "Chunks_pkey" CASCADE;

	ALTER TABLE ONLY "Messages"
		DROP CONSTRAINT "Messages_pkey" CASCADE;

	ALTER TABLE ONLY "Receivers"
		DROP CONSTRAINT "Receivers_pkey" CASCADE;

	ALTER TABLE ONLY "UserWithAccesses"
		DROP CONSTRAINT "UserWithAccesses_pkey" CASCADE;
`

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

		return {
			id: messageid,
			ChunkId: topicid,
			latest,
			latestInChunk: latest,

			sender,
			sendTime,

			meta,
			content
		}
	})
}

const messagesList = []

const chunkInclude = {
	include: [{
		association: ChatChunk.Receiver,
	}]
}

function migrateTopic(id) {
	return Bluebird.all([
		client.hgetallAsync(`topic:${id}:meta`),
		client.hgetallAsync(`topic:${id}:receiverKeys`),
	]).then(([meta, receiverKeys]) => {
		meta.receiver = meta.receiver.split(",").map(h.parseDecimal)

		const chat = {
			id
		}

		const chunk = {
			id,
			meta,
			receiverKeys,
			ChatId: id
		}

		const messages = client.zrangeAsync(`topic:${id}:messages`, 0, -1).map(h.parseDecimal).then((messageIDs) => {
			return messageIDs.sort((a, b) =>
				a - b
			)
		}).map((messageID, index, len) => {
			messagesList.push({
				messageID,
				latest: index === len - 1
			})
		})

		return Bluebird.all([chunk, chat, messages])
	})
}

const MESSAGE_BULK_SIZE = 1000
let t = process.hrtime()

const createMessages = (startIndex = 0) => {
	const nextIndex = startIndex + MESSAGE_BULK_SIZE
	const currentBulk = messagesList.slice(startIndex, nextIndex)

	if (startIndex % 50000 === 0) {
		const r = process.hrtime(t)
		t = process.hrtime()

		console.log(`Finished ${startIndex} messages and took ${r[0]}:${r[1]}`)
	}

	if (currentBulk.length === 0) {
		return Bluebird.resolve()
	}

	return Bluebird.all(currentBulk.map(({ messageID, latest }) => migrateMessage(messageID, latest))).then((messages) => {
		return Message.bulkCreate(messages)
	}).then(() => {
		return createMessages(nextIndex)
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

const migrateTopics = () => {
	return sequelize.query(REMOVE_CONSTRAINTS).then(() => {
		return client.getAsync("topic:topics")
	}).then((maximumIDString) => {
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
	}).then((results) => {
		const chats = results.map(([chat]) => chat)
		const chunks = results.map(([chunk]) => chunk)

		return Bluebird.all([
			Chat.bulkCreate(chats),
			Bluebird.all(
				chunks.map((chunk) => ChatChunk.create(chunk, chunkInclude))
			)
		])
	}).then(() => {
		return createMessages()
	}).then(() => {
		console.log("Recreating indices and sequences")
		console.time("Indices")
		return Bluebird.all([
			sequelize.query("select setval('\"Chats_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Chats\"));"),
			sequelize.query("select setval('\"Chunks_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Chunks\"));"),
			sequelize.query("select setval('\"Messages_id_seq\"'::regclass, (select MAX(\"id\") FROM \"Messages\"));"),
			sequelize.query(ADD_CONSTRAINTS),
		])
	}).then(() => console.timeEnd("Indices"))
}

setup().then(() => {
	return migrateTopics()
}).then(() => {
	return migrateTopicUpdates()
}).then(() => {
	console.log("END")
	process.exit(0)
}).catch((e) => {
	console.error(e);
	process.exit(1);
})
