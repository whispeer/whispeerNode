#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var setupP = Bluebird.promisify(setup);

var verifySecuredMeta = Bluebird.promisify(require("../includes/verifyObject"));

function requestMock(userID) {
	return {
		session: {
			getUserID: function () {
				return userID;
			}
		}
	};
}

function getUserID(key, val) {
	switch(val._type) {
		case "settings":
		case "profile":
		case "circle":
			return key.match(/\:(\d+)\:/)[1];
		case "topic":
			return h.parseDecimal(val.creator);
		case "message":
			return h.parseDecimal(val.sender);
		default:
			throw new Error("unknown meta type: " + val._type);
	}
}

function getNotVerified(key, val) {
	switch(val._type) {
		case "topic":
			return ["newest", "topicid", "unread", "newestTime"];
		case "message":
			return ["sendTime", "sender", "topicid", "messageid"];
		default:
			return [];
	}
}

function verifyKey(key) {
	return client.typeAsync(key).then(function (type) {
		switch(type) {
			case "hash":
				return client.hgetallAsync(key);
			case "string":
				return client.getAsync(key);
			default:
				throw new Error("unknown type: " + type);
		}
	}).then(function (val) {
		if (typeof val === "string") {
			val = JSON.parse(val);
		}

		if (val.meta) {
			val = val.meta;
		}

		if (typeof val === "string") {
			val = JSON.parse(val);
		}

		return val;
	}).then(function (val) {
		var userID = getUserID(key, val);
		var notVerified = getNotVerified(key, val);

		notVerified.forEach(function (attr) {
			delete val[attr];
		});

		if (val.images) {
			val.images = JSON.parse(val.images);
		}

		if (val.receiver) {
			val.receiver = val.receiver.split(",").map(h.parseDecimal).sort();
		}

		return verifySecuredMeta(requestMock(userID), val, val._type);
	}).catch(function (e) {
		console.log("error for key: " + key);
		console.warn(e);
		console.warn(e.stack);

		return false;
	});
}

var pattern = process.argv[2];

setupP().then(function () {
	console.log("Getting keys for: " + pattern);
	return client.keysAsync(pattern);
}).then(function (keys) {
	console.log("Got: " + keys.length + " matches");
	return keys;
}).map(function (key) {
	return verifyKey(key);
}).then(function (results) {
	console.log(results.reduce(function (prev, cur) { return prev && cur; }, true));

	console.log("done checking signatures");
	process.exit();
});
