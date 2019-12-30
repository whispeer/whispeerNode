#!/usr/bin/env node

/* eslint-disable no-console, no-unused-vars */

const Bluebird = require("bluebird");
const _ = require("lodash");
const fs = require("fs");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");

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

const exportKeys = async (keys) => {
  const values = await Bluebird.resolve(keys).map(async (key) => {
    const value = await client.dumpAsync(key);
    return [key, value];
  });

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
    `mail:${userID}`,
  ]),
  // exportPattern(`user:${userID}:*`),
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

const exportRedis = async (userID) => {
  await exportUserSessions(userID);
  await exportUser(userID);
  await exportUserPosts(userID);
  await exportUserComments(userID);
  await exportUserFriends(userID);

  fs.writeFileSync(`./export/export-${userID}-redis.json`, JSON.stringify(redisExport, null, 2))

  console.log(redisExport.map(([a]) => a));
};

const path = __dirname

const exportPG = async (userID) => {
  console.log(__dirname);

  `COPY (SELECT * FROM "public"."Messages" WHERE sender = ${userID}) TO '/Users/nilos/software/whispeer/node/export/export-${userID}-messages.csv';`
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

  await Bluebird.all([
    exportRedis(exportUserID),
    exportPG(exportUserID)
  ])
}).then(function () {
  process.exit();
});
