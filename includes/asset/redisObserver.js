"use strict";

var client = require("../redisClient");
var config = require("../configManager").get();

var RedisObserver = function (base, id) {
	var theObserver = this;

	this._listeners = {};
	this._namespace = "db:" + (config.dbNumber || 0) + ":observer:" + base + ":" + id + ":";

	function rewrite(cb) {
		return function (channel, data) {
			var subChannel = channel.substr(theObserver._namespace.length);
			cb(subChannel, data);
		};
	}

	this.listenAll = function(socket, fn) {
		var closeSubscriber = client.psub(this._namespace + "*", rewrite(fn));
		socket.once("disconnect", closeSubscriber);
	};

	this.listen = function(socket, type, fn) {
		var closeSubscriber = client.sub(this._namespace + type, rewrite(fn));
		socket.once("disconnect", closeSubscriber);
	};

	this.notify = function(type, data) {
		client.pub.publish(this._namespace + type, JSON.stringify(data));
	};
};

module.exports = RedisObserver;
