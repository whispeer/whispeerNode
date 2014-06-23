
"use strict";

function RequestData(socketData) {
	this.session = socketData.session;
	this.socket = socketData.socket;
	this.socketData = socketData;
}

var util = require("util");
var EventEmitter = require("events").EventEmitter;
util.inherits(RequestData, EventEmitter);

module.exports = RequestData;