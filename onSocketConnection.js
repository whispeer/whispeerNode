"use strict";
var step = require("step");
var h = require("whispeerHelper");
var Bluebird = require("bluebird")

var HandlerCallback = require("./includes/handlerCallback");
var listener = require("./includes/listener");
var topics = require("./topics.js");

var SocketData = require("./includes/socketData");
var RequestData = require("./includes/requestData");
var Session = require("./includes/session");

var APIVERSION = "0.0.1";
var KeyApi = require("./includes/crypto/KeyApi");

Error.stackTraceLimit = Infinity;

function registerSocketListener(socketData) {
	if (socketData.session.getUserID() === 0) {
		return;
	}

	step(function () {
		socketData.session.getOwnUser(this);
	}, h.sF(function (ownUser) {
		ownUser.listenAll(socketData, function (channel, data) {
			if (listener[channel]) {
				listener[channel](socketData, data);
			} else {
				socketData.socket.emit("notify." + channel, (typeof data === "string" ? JSON.parse(data) : data));
			}
		});
	}), function (e) {
		if (e) {
			console.error(e);
		}
	});
}

var reservedNames = ["sid", "version"], handle;

function createKeys(request, keys, cb) {
	step(function () {
		request.session.logedinError(this);
	}, h.sF(function () {
		//TODO: this might fail if one of the decryptors is a key we also want to add!
		keys.forEach(function (keyData) {
			KeyApi.createWithDecryptors(request, keyData, this.parallel());
		}, this);
	}), cb);
}

function callExplicitHandler(handler, data, cb, request) {
	var explicitHandlerRequest = new RequestData(request, data, request.channel);

	step(function () {
		if (handler.noLoginNeeded) {
			this.ne();
		} else {
			request.session.logedinError(this.parallel());
			request.checkOriginAccess(this.parallel())
		}
	}, h.sF(function () {
		if (Array.isArray(data.keys)) {
			createKeys(explicitHandlerRequest, data.keys, this);
		} else {
			this.ne();
		}
	}), h.sF(function () {
		handler(data, new HandlerCallback(this.ne, explicitHandlerRequest), explicitHandlerRequest);
	}), cb);
}

function callSubHandlers(handlerObject, data, cb, request) {
	var topics = [];

	step(function () {
		h.objectEach(data, function (topic, value) {
			if (reservedNames.indexOf(topic) === -1) {
				topics.push(topic);
				handle(handlerObject[topic], value, this.parallel(), request);
			}
		}, this);
	}, h.sF(function (results) {
		this.ne(h.array.spreadByArray(results, topics));
	}), cb);
}

handle = function (handler, data, fn, request) {
	if (typeof handler === "function") {
		callExplicitHandler(handler, data, fn, request);
	} else if (typeof handler === "object" && typeof data === "object") {
		callSubHandlers(handler, data, fn, request);
	} else {
		console.log("could not match handler and data");
	}
};

/** adds data which is always present.
* mainly adds login data
*/
function always(request, response, fn) {
	step(function () {
		this.parallel.unflatten();
		request.session.logedin(this.parallel());
		request.session.isBusiness(this.parallel())
		request.socketData.recentActivity();
	}, function (e, logedin, isBusiness) {
		if (e) {
			console.error(e);
			response.status = 0;
		}

		if (response.status !== 0) {
			response.status = 1;
		}

		response.version = APIVERSION;

		response.keys = request.getAllKeys();

		response.logedin = logedin;

		if (logedin) {
			response.sid = request.session.getSID();
			response.userid = request.session.getUserID();
			response.serverTime = new Date().getTime();
			response.isBusiness = isBusiness
		}

		this(response);
	}, fn);
}

module.exports = function (socket) {
	console.log("connection received");
	var session = new Session();

	var socketData = new SocketData(socket, session);
	registerSocketListener(socketData);

	session.changeListener((logedin) => {
		Bluebird.try(() => {
			socketData.emit("disconnect");
			socketData = new SocketData(socket, session);

			if (logedin) {
				registerSocketListener(socketData);
			}
		}).catch((e) => {
			console.error(e);
		});
	});

	function handleF(handler, channel) {
		return function (data, fn) {
			var time = new Date().getTime();
			var request = new RequestData(socketData, data, channel);
			step(function () {
				console.log(new Date() + " (v" + data.version + ") Received data on channel " + channel);

				if (session.getSID() !== data.sid) {
					session.setSID(data.sid, this);
				} else {
					this.ne();
				}
			}, h.sF(function () {
				handle(handler, data, this, request);
			}), function (e, result) {
				if (e) {
					result = {
						status: 0
					};
				}

				always(request, result, fn);
				console.log(new Date() + " Request handled after: " + (new Date().getTime() - time) + " (" + channel + ")");
			});
		};
	}

	function registerHandler(topics, base) {
		h.objectEach(topics, function (topic, cur) {
			socket.on(base + topic, handleF(cur, base + topic));
			if (typeof cur === "object") {
				registerHandler(cur, base + topic + ".");
			}
		});
	}

	registerHandler(topics, "");

	socket.on("data", handleF(topics, "data"));

	socket.on("error", function () {
		console.error(arguments);
	});

	socket.on("disconnect", function () {
		socketData.emit("disconnect");
		//unregister listener
		console.log("client disconnected");
	});
};
