const Bluebird = require("bluebird");
// const _ = require("lodash");
const fs = require("fs");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");
const sequelize = require("../includes/dbConnector/sequelizeClient");

const setupP = Bluebird.promisify(setup);

const importPG = async (userID) => {
  const tables = [
    "Chats",
    "Chunks",
    "ChunkTitleUpdates",
    "Messages",
    "pushTokens",
    "Receivers",
    "UserUnreadMessages",
  ]

  await Bluebird.resolve(tables).each(async (table) => {
    return sequelize.transaction((transaction) => {
      const query = `
        CREATE TEMP TABLE tmp_table_${table}
        ON COMMIT DROP
        AS
        SELECT *
        FROM "public"."${table}"
        WITH NO DATA;

        COPY tmp_table_${table} FROM '${process.cwd()}/export/user-${userID}/${table}.csv';

        DELETE FROM tmp_table_${table} WHERE id IN (SELECT id FROM "${table}");

        INSERT INTO "${table}"
        SELECT *
        FROM tmp_table_${table};
      `;

      return sequelize.query(query, { transaction });
    });
  })
}

const importRedis = async (userID) => {
  const redisBackup = JSON.parse(fs.readFileSync(`./export/user-${userID}/redis.json`));

  await Bluebird.resolve(redisBackup)
    .map(([key, value]) => client.restoreAsync(key, 0, Buffer.from(value, "base64"), "REPLACE").catch((e) => {
      console.error(key, value);
      console.error(e);
      process.exit(1);
    }));
}

Bluebird.try(async () => {
  const importUserID = parseInt(process.argv[2], 10);

  if (importUserID < 1 || !importUserID) {
    console.log("Invalid user id");
    process.exit(-1);
  }

	await setupP();
  console.log(`Importing user ${importUserID}`);

  await Bluebird.all([
    importRedis(importUserID),
    importPG(importUserID)
  ])
}).then(function () {
  process.exit();
});
