"use strict";

var redis = require("redis");
var Bluebird = require("bluebird");
var random = require("secure_random");

Bluebird.promisifyAll(redis);
Bluebird.promisifyAll(random);

var configManager = require("./configManager");
var config = configManager.get();

function create(options = {}) {
	return redis.createClient(config.db.port || 6379, config.db.url || "127.0.0.1", options);
}

var client = create();

client.sub = function subF(channel, callback) {
	var client = create();

    client.on("subscribe", function (channel, count) {
        console.log("subscribed to: " + channel + " (" + count + ")");
    });

    client.on("message", function (channel, message) {
        console.log("client channel " + channel + ": " + message);

        callback(channel, message);
    });

    client.subscribe(channel);

    return function () {
		client.unsubscribe();
		client.quit();
    };
};

client.psub = function subF(channel, callback) {
    var client = create();

    client.on("psubscribe", function (channel, count) {
        console.log("psubscribed to: " + channel + " (" + count + ")");
    });

    client.on("pmessage", function (pattern, channel, message) {
        console.log("pmessage on channel " + channel);

        callback(channel, message);
    });

    client.psubscribe(channel);

    return function () {
        client.punsubscribe();
        client.quit();
    };
};

client.pub = create();
client.create = create;

module.exports = client;
