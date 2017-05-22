"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Bluebird = require("bluebird")

var KeyApi = require("./crypto/KeyApi");
var errorService = require("./errorService");

function RequestData(socketData, rawRequest, channel) {
	var request = this;

	this.session = socketData.session;
	this.socket = socketData.socket;
	this.rawRequest = rawRequest;
	this.channel = channel;

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

	this.blockNonBusinessAccess = () => {
		return this.session.isBusiness().then((isBusiness) => {
			if (!isBusiness) {
				throw new AccessViolation("Not a business account")
			}
		})
	}

	this.checkOriginAccess = (cb) => {
		if (!this.isBusinessOrigin()) {
			return Bluebird.resolve().nodeify(cb)
		}

		return this.blockPrivateAccess().nodeify(cb)
	}

	this.isBusinessOrigin = () => {
		const request = this.socketData.socket.request

		if (request && request.headers && request.headers.origin) {
			return request.headers.origin.match(/^https:\/\/business\.whispeer/)
		}

		return false
	}

	this.getShortIP = function () {
		return socketData.getShortIP();
	};

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

	this.addKey = function (realid, cb, filter) {
		if (typeof cb !== "function") {
			throw new Error("did not get a function callback");
		}

		if (this.rootRequest) {
			this.rootRequest.addKey(realid, cb, filter);
		} else {
			step(function () {
				KeyApi.get(realid, this);
			}, h.sF(function (key) {
				key.getKData(request, this, true);
			}), h.sF(function (keyData) {
				if (typeof filter === "function") {
					keyData.decryptors = keyData.decryptors.filter(filter);
				}

				request.keyData.push(keyData);
				this.ne();
			}), function (e) {
				errorService.handleError(e, request);

				this.ne();
			}, cb);
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
