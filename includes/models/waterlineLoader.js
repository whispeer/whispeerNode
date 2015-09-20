"use strict";

var Waterline = require("waterline"),
    redisAdapter = require("sails-redis"),
    config = require("../configManager").get(),
    Bluebird = require("bluebird");

var waterlineConfig = {
  // 2. Specify `adapters` config
  adapters: {
    redis: redisAdapter
  },

  connections: {
    redis: {
      adapter: "redis"
    }
  },

  // 3. Specify `connections` config
  redisConfig: {
    adapter: "redis",
    port: config.db.port || 6379, 
    host: config.db.url || "127.0.0.1",
    database: config.db.number
  }
};

var models = ["pushKey"];

var waterline = new Waterline();

models.forEach(function (modelName) {
  waterline.loadCollection(require("./" + modelName + "Model"));
});

var initializeWaterline = Bluebird.promisify(waterline.initialize, waterline);

// 5. Initialize Waterline
module.exports = initializeWaterline(waterlineConfig);
