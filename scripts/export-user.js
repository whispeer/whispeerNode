#!/usr/bin/env node

/* eslint-disable no-console, no-unused-vars */

const Bluebird = require("bluebird");
const _ = require("lodash");
const fs = require("fs");
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

const redisExport = [];

const clientBuffers = client.create({
	return_buffers: true
});

const exportKeys = async (keys) => {
  const values = await Bluebird.resolve(keys).map(async (key) => {
		const value = await clientBuffers.dumpAsync(key);

		if (!value) {
			return;
		}

		const ttl = await client.pttlAsync(key);
		if (ttl >= 0) {
			console.log("ttl found", ttl, key);
		}

		return [key, value.toString("base64")];
  }).filter((val) => typeof val !== "undefined");

  redisExport.push(...values);
}

const exportPattern = async (pattern) => {
  const keys = await client.keysAsync(pattern);

  await exportKeys(keys);
}

const exportReferences = async (userID) => {
  await client.smembersAsync(`mail:${userID}`)
    .map((mail) =>
      exportKeys([`user:mail:${mail}`])
    )

  const nickname = await client.hgetAsync(`user:${userID}`, "nickname")

  await exportKeys([`user:nickname:${nickname.toLowerCase()}`])
}

const exportUser = async (userID) => Promise.all([
  exportKeys([
    `user:${userID}`,
    `user:id:${userID}`,
    `mail:${userID}`,
  ]),
  exportPattern(`user:${userID}:*`),
  exportReferences(userID),
]);

const exportUserSessions = async (userID)  => {
  const keys = await client.keysAsync("session:*")
    .filter((key) => client.getAsync(key).then((value) => parseInt(value, 10) === userID));

  await exportKeys(keys);
}

const exportUserPosts = async (userID) => {
  await client.zrangeAsync(`user:${userID}:posts`, 0, -1)
    .map((postID) =>
      exportKeys([
        `post:${postID}:meta`,
        `post:${postID}:content`,
        `post:${postID}:private`,
        `post:${postID}:comments:list`,
        `post:${postID}:comments:count`,
        `post:${postID}`,
      ])
    );
}

const exportUserComments = async (userID) => {
  await client.keysAsync("post:*:comments:*:meta")
    .filter((key) =>client.hgetAsync(key, "sender").then((senderID) => parseInt(senderID, 10) === userID))
    .map((key) => {
      const base = key.replace(/:meta$/, "");
      return exportKeys([
        `${base}:meta`,
        `${base}:content`,
      ])
    });
}

const exportUserFriends = (userID) =>
  Promise.all([
    exportPattern(`friends:${userID}:*`),
    exportKeys([`friends:${userID}`]),
  ]);

const copyBlobs = async (userID, blobIDs) => {
  await Bluebird.resolve(blobIDs)
  .map((id) =>
    fs.promises.copyFile(`./files/${id}.png`, `./export/user-${userID}/blobs/${id}.png`)
      .catch((e) => e.code !== "ENOENT" ? Promise.reject(e) : null)
  )
}

const exportBlobs = async (userID) => {
  const nickname = await client.hgetAsync(`user:${userID}`, "nickname");

  const myBlobs = await client.keysAsync("blobs:*")
    .map((key) => key.split(":")[1])
    .filter(async (blobID) => {
      if (blobID.length !== 30) {
        return false;
      }

      const key = await client.hgetAsync(`blobs:${blobID}`, "_key");

      if (!key) {
        return false;
      }

      return key.indexOf(nickname) === 0;
    });

  const profileJSON = await client.hgetAsync(`user:${userID}:profile`, "content");
  const profile = JSON.parse(profileJSON);

  if (profile && profile.imageBlob && profile.imageBlob.blobid) {
    myBlobs.push(profile.imageBlob.blobid);
  }

  await exportKeys(myBlobs.map((id) => `blobs:${id}`));
  await copyBlobs(userID, myBlobs);
}

const exportRedis = async (userID) => {
  await exportUserSessions(userID);
  await exportUser(userID);
  await exportUserPosts(userID);
  await exportUserComments(userID);
  await exportUserFriends(userID);
  await exportBlobs(userID);

  fs.writeFileSync(`./export/user-${userID}/redis.json`, JSON.stringify(redisExport, null, 2))

  console.log(`Exported ${redisExport.length} keys to redis.json`);
};

const path = __dirname

const exportPG = async (userID) => {
  // Taken from https://stackoverflow.com/questions/12815496/export-specific-rows-from-a-postgresql-table-as-insert-sql-script

  const receiverQuery = `SELECT DISTINCT "Receivers"."ChunkId" FROM "Receivers" WHERE "Receivers"."userID" = ${userID}`

  const queries = [
    ["Chats", `SELECT * FROM "Chats" WHERE id IN (SELECT DISTINCT "Chunks"."ChatId" FROM "Chunks" WHERE id IN (${receiverQuery}))`],
    ["Chunks", `SELECT * FROM "Chunks" WHERE id IN (${receiverQuery})`],
    ["ChunkTitleUpdates", `SELECT * FROM "ChunkTitleUpdates" WHERE "ChunkTitleUpdates"."ChunkId" IN (${receiverQuery})`],
    ["Messages", `SELECT * FROM "Messages" WHERE "Messages"."sender" = ${userID}`],
    ["pushTokens", `SELECT * FROM "pushTokens" WHERE "pushTokens"."userID" = ${userID}`],
    ["Receivers", `SELECT * FROM "Receivers" WHERE "Receivers"."ChunkId" IN (${receiverQuery})`],
    ["UserUnreadMessages", `SELECT * FROM "UserUnreadMessages" WHERE "UserUnreadMessages"."userID" = ${userID}`],
  ]

  await Bluebird.resolve(queries).each(async ([table, query]) =>
    sequelize.query(`COPY (${query}) TO '${process.cwd()}/export/user-${userID}/${table}.csv';`)
  )
};

Bluebird.try(async () => {
  const exportUserID = parseInt(process.argv[2], 10);

  if (exportUserID < 1 || !exportUserID) {
    console.log("Invalid user id");
    process.exit(-1);
  }

	await setupP();
  const nickname = await client.hgetAsync(`user:${exportUserID}`, "nickname");

  console.log(`Exporting user ${nickname} (${exportUserID})`);

  fs.mkdirSync(`./export/user-${exportUserID}/blobs`, { recursive: true });

  await Bluebird.all([
    exportRedis(exportUserID),
    exportPG(exportUserID)
  ])
}).then(function () {
  process.exit();
});
