const Bluebird = require("bluebird");
const setup = require("../includes/setup");
const client = require("../includes/redisClient");
const Chunk = require("../includes/models/chatChunk")
const Message = require("../includes/models/message")
const Chat = require("../includes/models/chat")

const setupP = Bluebird.promisify(setup);

const rebuildBlobIndex = async () => {
  const blobIds = await client.keysAsync("blobs:*").map(key => key.split(":")[1]);

  await client.saddAsync("blobs:usedids", blobIds);
}

const rebuildChatIndex = async () => {
  // chunk latest
  // message latest
  // message latestInChunk

  await Chunk.update({
    latestInChunk: false,
    latest: false,
  }, {
    where: {}
  });

  await Chunk.findAll().map(async (chunk) => {
    const message = await Message.findOne({
      where: {
        ChunkId: chunk.id,
      },
      order: [["sendTime", "DESC"]]
    });

    if (!message) {
      console.warn("No messages in chunk: ", chunk.id);
      return;
    }

    message.latestInChunk = true;
    await message.save();
  });

  await Chat.findAll().map(async (chat) => {
    const chunk = await Chunk.findOne({
      where: {
        ChatId: chat.id,
      },
      order: [["id", "DESC"]]
    });

    if (!chunk) {
      console.warn("No chunks in chat: ", chat.id);
      return;
    }

    chunk.latest = true;
    await chunk.save();

    await Message.update({
      latest: true,
    }, {
      where: {
        ChunkId: chunk.id,
        latestInChunk: true
      }
    })
  });
};

const rebuildIndexes = async () => {
  console.log("Rebuild indexes");
  await rebuildBlobIndex();
  await rebuildChatIndex();
}

const run = () => {
  Bluebird.try(async () => {
    await setupP();
    await rebuildIndexes();
  }).then(function () {
    process.exit();
  });
}

if (module.parent) {
  module.exports = rebuildIndexes;
} else {
  run();
}