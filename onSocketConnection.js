var step = require("step");
var h = require("whispeerHelper");

var HandlerCallback = require("./includes/handlerCallback");
var listener = require("./includes/listener");
var topics = require("./topics.js");

var View = require("./includes/view");
var Session = require("./includes/session");

var KeyApi = require("./includes/crypto/KeyApi");

module.exports = function (socket) {
	"use strict";
	console.log("connection received");
	var session = new Session();

	var myView = new View(socket, session, listener);
	var reservedNames = ["sid"];

	function createKeys(view, keys, cb) {
		step(function () {
			view.logedinError(this);
		}, h.sF(function () {
			keys.forEach(function (keyData) {
				KeyApi.createWithDecryptors(view, keyData, this.parallel());
			}, this);
		}), cb);
	}

	function callExplicitHandler(handler, data, cb, view) {
		step(function () {
			if (Array.isArray(data.keys)) {
				createKeys(view, data.keys, this);
			} else {
				this.ne();
			}
		}, h.sF(function () {
			handler(data, new HandlerCallback(this.ne), view);
		}), cb);
	}

	function callSubHandlers(handlerObject, data, cb, view) {
		var topics = [];

		step(function () {
			h.objectEach(data, function (topic, value) {
				if (reservedNames.indexOf(topic) === -1) {
					topics.push(topic);
					handle(handlerObject[topic], value, this.parallel(), view);
				}
			}, this);
		}, h.sF(function (results) {
			this.ne(h.array.spreadByArray(results, topics));
		}), cb);
	}

	function handle(handler, data, fn, view) {
		if (typeof handler === "function") {
			callExplicitHandler(handler, data, fn, view);
		} else if (typeof handler === "object" && typeof data === "object") {
			callSubHandlers(handler, data, fn, view);
		} else {
			console.log("could not match handler and data");
		}
	}

	/** adds data which is always present.
	* mainly adds login data
	*/
	function always(view, data, fn) {
		step(function () {
			this.parallel.unflatten();
			view.logedin(this.parallel());
			view.recentActivity();
		}, function (e, logedin) {
			if (e) {
				console.error(e);
				data.status = 0;
			}

			if (data.status !== 0) {
				data.status = 1;
			}

			data.logedin = logedin;

			if (logedin) {
				data.sid = view.session.getSID();
				data.userid = view.session.getUserID();
				data.serverTime = new Date().getTime();
			}

			this(data);
		}, fn);
	}

	function handleF(handler, channel) {
		return function handleF(data, fn) {
			var time = new Date().getTime();
			step(function () {
				console.log("Received data on channel " + channel);

				if (myView.session().getSID() !== data.sid) {
					myView.session().setSID(data.sid, this);
				} else {
					this.ne();
				}
			}, h.sF(function () {
				handle(handler, data, this, myView);
			}), function (e, result) {
				if (e) {
					result = {
						status: 0
					};
				}

				always(myView, result, fn);
				console.log("Request handled after: " + (new Date().getTime() - time) + " (" + channel + ")");
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
		myView.destroy();
		//unregister listener
		console.log("client disconnected");
	});
};
