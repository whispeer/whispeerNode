"use strict";

var client = require("../redisClient");
var config = require("../configManager").get();

var RedisObserver = function (base, id) {
	var theObserver = this;

	this._listeners = {};
	this._namespace = "db:" + (config.dbNumber || 0) + ":observer:" + base + ":" + id + ":";

	function rewrite(cb) {
		var namespace = theObserver._namespace;
		return function (channel, data) {
			var subChannel = channel.substr(namespace.length);
			cb(subChannel, JSON.parse(data), id);
		};
	}

	this.listenAll = function(socket, fn) {
		socket.psub(this._namespace + "*", rewrite(fn));
	};

	this.listen = function(socket, type, fn) {
		socket.sub(this._namespace + type, rewrite(fn));
	};

	this.notify = function(type, data) {
		client.pub.publish(this._namespace + type, JSON.stringify(data));
	};
};

module.exports = RedisObserver;
