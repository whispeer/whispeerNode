"use strict";

var redis = require("redis");

function create() {
	return redis.createClient();
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
		client.end();
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
        client.end();
    };
};

client.pub = create();

module.exports = client;