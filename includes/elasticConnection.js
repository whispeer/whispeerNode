"use strict"

const elasticsearch = require("elasticsearch");
module.exports = new elasticsearch.Client({
  host: "localhost:9200"
});
