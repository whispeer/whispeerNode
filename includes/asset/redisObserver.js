"use strict";

var client = require("./redisClient");

var RedisObserver = function (base, id) {
    this._listeners = {};
    this._namespace = "observer:" + base + ":" + id + ":";
};

RedisObserver.prototype.listenAll = function(request, fn) {
    var closeSubscriber = client.psub(this._namespace + "*", fn);
    request.socket.once("disconnect", closeSubscriber);
};

RedisObserver.prototype.listen = function(request, type, fn) {
    var closeSubscriber = client.sub(this._namespace + type, fn);
    request.socket.once("disconnect", closeSubscriber);
};

RedisObserver.prototype.notify = function(type, data) {
    client.pub.publish(this._namespace + type, JSON.stringify(data));
};

return RedisObserver;