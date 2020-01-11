#!/usr/bin/env node

/* eslint-disable no-console, no-unused-vars */

const Bluebird = require("bluebird");
const _ = require("lodash");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");
const sequelize = require("../includes/dbConnector/sequelizeClient");

const setupP = Bluebird.promisify(setup);

const Message = require("../includes/models/message")
const Chunk = require("../includes/models/chatChunk")

// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
const requireConfirmation = Bluebird.promisify(function(message, action) {
	console.log(message);
	if (process.stdout.isTTY) {
		var stdin = process.openStdin();
		console.log("Press y and enter to continue!");

		stdin.on("data", function(chunk) {
			if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
				action();
			} else {
				console.log("Aborted!");
				process.exit(-1);
			}
		});
	} else {
		action();
	}
});

const toDelete = [
	"undefined:*",
	"online:*",
	"invites:*",
	"analytics:*",
	"mail:*",
	"friends:*",
	"session:*",
	"post:*",
	"post",
	"blobs:*",
	"user:donated",
	"user:count",
	"user:awayCheck",
	"user:registered",
	"user:list",
	"user:online",
	"user:online:timed",
	"user:mail:*",
	"user:id:*",
];

const tables = [
	"Chats",
	"Chunks",
	"ChunkTitleUpdates",
	"Messages",
	"pushTokens",
	"Receivers",
	"UserUnreadMessages",
];

const deleteRedis = async () => {
	// Don't delete 'key:*'
	// Don't delete user nicknames but set id to -1

	await Bluebird.resolve(toDelete).map(async (pattern) => {
		const keys = await client.keysAsync(pattern);
		if (keys.length > 0) {
			await client.delAsync(keys);
		}
	});

	const nicknames = await client.keysAsync("user:nickname:*");
	await Bluebird.resolve(nicknames).map(nickname => client.setAsync(nickname, -1));

	const ids = await client.keysAsync("user:*").filter((key) => key.split(":")[1].match(/[0-9]+/));
	if (ids.length > 0) {
		await client.delAsync(ids);
	}
};

const deletePG = async () => {
	await Bluebird.resolve(tables).each(async (table) => {
		await sequelize.query(`TRUNCATE "public"."${table}" CASCADE;`);
	});
};

Bluebird.try(async () => {
	await setupP();

  await requireConfirmation("Delete all user data!")

  console.log("DELETING");

  await Bluebird.all([
    deleteRedis(),
    deletePG()
  ])
}).then(function () {
  process.exit();
});
