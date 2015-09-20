var Waterline = require("waterline"),
    redisAdapter = require("sails-postgresql"),
    config = require("../configManager").get();

var waterlineConfig = {
  // 2. Specify `adapters` config
  adapters: {
    redis: redisAdapter
  },

  // 3. Specify `connections` config
  redisConfig: {
    adapter: "redis",
    port: config.db.port || 6379, 
    host: config.db.url || "127.0.0.1",
    database: config.db.number
  }
};

// 4. Define and load your collections
var PushKey;

var waterline = new Waterline();
waterline.loadCollection(PushKey);

// 5. Initialize Waterline
module.exports = waterline.initialize(waterlineConfig);
