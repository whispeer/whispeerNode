
"use strict";

function RequestData(socketData, rawRequest) {
	this.session = socketData.session;
	this.socket = socketData.socket;

	this.rawRequest = rawRequest;

	if (socketData instanceof RequestData) {
		this.rootRequest = socketData.rootRequest;
		this.parentRequest = socketData;
		this.socketData = socketData.socketData;
	} else {
		this.socketData = socketData;
		this.keyData = [];
	}

	this.addKey = function (realid, cb) {
		if (this.rootRequest) {
			this.rootRequest.addKeyData(realid, cb);
		} else {
			
		}		
	};

	this.addKeyData = function (keyData) {
		if (this.rootRequest) {
			this.rootRequest.addKeyData(keyData);
		} else {
			this.keyData.push(keyData);
		}
	};
}

var util = require("util");
var EventEmitter = require("events").EventEmitter;
util.inherits(RequestData, EventEmitter);

module.exports = RequestData;