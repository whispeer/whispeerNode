"use strict";
var step = require("step");
var h = require("whispeerHelper");
var Bluebird = require("bluebird")

const HandlerCallback = require("./includes/handlerCallback");
const listener = require("./includes/listener");
const api = require("./apis/api.js");

const SocketData = require("./includes/socketData");
const RequestData = require("./includes/requestData");
const Session = require("./includes/session");

const APIVERSION = "0.0.1";
const KeyApi = require("./includes/crypto/KeyApi");

const errorService = require("./includes/errorService");

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

	return socketData.session.getOwnUser().then((ownUser) => {
		ownUser.listenAll(socketData, function (channel, data) {
			if (listener[channel]) {
				listener[channel](socketData, data);
			} else {
				socketData.socket.emit("notify." + channel, (typeof data === "string" ? JSON.parse(data) : data));
			}
		});
	}).catch((e) => {
		errorService.handleError(e)
	});
}

var handle

function createKeys(request, keys, cb) {
	return request.session.logedinError().thenReturn(keys).mapSeries((keyData) => {
		//TODO: this might fail if one of the decryptors is a key we also want to add!
		return KeyApi.createWithDecryptors(request, keyData);
	}).nodeify(cb)
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

handle = function (handler, data, fn, request) {
	if (typeof handler === "function") {
		callExplicitHandler(handler, data, fn, request);
	} else {
		console.log("could not match handler and data");
		throw new Error("no handler found for request")
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
	}, function (e, loggedin, isBusiness) {
		if (e) {
			errorService.handleError(e, request);
			response.error = true;
		}

		if (response.status !== 0) {
			response.status = 1;
		}

		response.version = APIVERSION;

		response.keys = request.getAllKeys();

		response.logedin = loggedin;
		response.loggedin = loggedin;

		if (loggedin) {
			response.sid = request.session.getSID();
			response.userid = request.session.getUserID();
			response.serverTime = new Date().getTime();
			response.isBusiness = isBusiness
		}

		this(response);
	}, fn);
}

let socketCount = 0;
const startTime = new Date().getTime()

module.exports = function (socket) {
	console.log("connection received");

	const diff = (new Date().getTime() - startTime) / 1000 / 60

	if (socketCount > diff + 5) {
		console.log("Dropping socket", socketCount, diff)
		return
	}

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
			socketData.setVersion(data.version)

			var time = new Date().getTime();
			var request = new RequestData(socketData, data, channel);
			step(function () {
				log(` (${getVersion(data)}) Received data on channel ${channel}`);

				if (!data.clientInfo) {
					log(`User has old version: ${request.session.getUserID()}: ${data.version}`)
				}

				if (session.getSID() !== data.sid) {
					session.setSID(data.sid, this);
				} else {
					this.ne();
				}
			}, h.sF(function () {
				handle(handler, data, this, request);
			}), function (e, result) {
				if (e) {
					errorService.handleError(e, request);
					result = {
						status: 0
					};
				}

				always(request, result, fn);
				log(" Request handled after: " + (new Date().getTime() - time) + " (" + channel + ")");
			});
		};
	}

	function registerHandler(api, base) {
		h.objectEach(api, function (topic, cur) {
			socket.on(base + topic, handleF(cur, base + topic));
			if (typeof cur === "object") {
				registerHandler(cur, base + topic + ".");
			}
		});
	}

	registerHandler(api, "");

	socket.on("data", handleF(api, "data"));

	socket.on("error", function () {
		console.error(arguments);
	});

	socket.on("disconnect", function () {
		socketData.emit("disconnect");
		//unregister listener
		console.log("client disconnected");
	});
};
