"use strict";

var step = require("step");
var h = require("whispeerHelper");

var KeyApi = require("./crypto/KeyApi");

function RequestData(socketData, rawRequest) {
	var request = this;

	this.session = socketData.session;
	this.socket = socketData.socket;
	this.rawRequest = rawRequest;

	this.children = [];

	if (socketData instanceof RequestData) {
		this.rootRequest = socketData.rootRequest || socketData;
		this.parentRequest = socketData;
		this.socketData = socketData.socketData;

		this.parentRequest.addChildRequest(this);
	} else {
		this.socketData = socketData;
		this.keyData = [];
	}

	this.addChildRequest = function (child) {
		this.children.push(child);
	};

	this.getAllKeys = function () {
		var allKeys, realIDs = [];

		if (!this.rootRequest) {
			allKeys = this.keyData.filter(function (key) {
				if (realIDs.indexOf(key.realid) > -1) {
					return false;
				}

				realIDs.push(key.realid);
				return true;
			});
		}

		return allKeys;
	};

	this.addKey = function (realid, cb) {
		if (this.rootRequest) {
			this.rootRequest.addKey(realid, cb);
		} else {
			step(function () {
				KeyApi.get(realid, this);
			}, h.sF(function (key) {
				key.getKData(request, this, true);
			}), h.sF(function (keyData) {
				request.keyData.push(keyData);
				cb();
			}), cb);
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
