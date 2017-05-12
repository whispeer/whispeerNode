"use strict";
const step = require("step");
const h = require("whispeerHelper");

const HandlerCallback = require("./includes/handlerCallback");
const listener = require("./includes/listener");
const topics = require("./topics.js");

const SocketData = require("./includes/socketData");
const RequestData = require("./includes/requestData");
const Session = require("./includes/session");

const APIVERSION = "0.0.1";
const KeyApi = require("./includes/crypto/KeyApi");

Error.stackTraceLimit = Infinity;

const log = (val) => {
	console.log(`${new Date()} ${val}`);
}

const getVersion = (data) => {
	const { version, clientInfo } = data

	if (clientInfo) {
		return `${clientInfo.type}-${clientInfo.version}`
	}

	return version
}

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
			request.session.logedinError(this);
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
	console.warn("call sub handlers")
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
		request.session.logedin(this);
		request.socketData.recentActivity();
	}, function (e, logedin) {
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
		}

		this(response);
	}, fn);
}

module.exports = function (socket) {
	console.log("connection received");
	var session = new Session();

	var socketData = new SocketData(socket, session);
	registerSocketListener(socketData);

	session.changeListener(function sessionChange(logedin) {
		step(function () {
			socketData.emit("disconnect");
			socketData = new SocketData(socket, session);

			if (logedin) {
				registerSocketListener(socketData);
			}
		}, function (e) {
			if (e) {
				console.error(e);
			}
		});
	});

	function handleF(handler, channel) {
		return function handleF(data, fn) {
			var time = new Date().getTime();
			var request = new RequestData(socketData, data, channel);
			step(function () {
				log(` (${getVersion(data)}) Received data on channel ${channel}`);

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
				log(" Request handled after: " + (new Date().getTime() - time) + " (" + channel + ")");
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
