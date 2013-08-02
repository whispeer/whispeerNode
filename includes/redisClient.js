"use strict";

var redis = require("redis");

function create() {
	return redis.createClient();
}

var client = create();

client.sub = function subF(channel, callback) {
	var client = create();
	client.subscribe(channel);

    client.on("message", function (channel, message) {
        console.log("client channel " + channel + ": " + message);

        callback(message);
    });

    return function () {
		client.unsubscribe();
		client.end();
    };
};

client.psub = function subF(channel, callback) {
    var client = create();
    client.psubscribe(channel);

    client.on("message", function (channel, message) {
        console.log("client channel " + channel + ": " + message);

        callback(channel, message);
    });

    return function () {
        client.punsubscribe();
        client.end();
    };
};

client.pub = create();

module.exports = client;