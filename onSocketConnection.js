var step = require("step");
var h = require("whispeerHelper");

var HandlerCallback = require("./includes/handlerCallback");
var listener = require("./includes/listener");
var topics = require("./topics.js");

var View = require("./includes/view");
var Session = require("./includes/session");

module.exports = function (socket) {
	"use strict";
	console.log("connection received");
	var session = new Session();

	var myView = new View(socket, session, listener);

	function handle(handler, data, fn, view) {
		var topics = [];
		//console.log("Handling:");
		//console.log(data);
		step(function () {
			var usedHandler = false;
			if (typeof handler === "function") {
				handler(data, new HandlerCallback(this.last.ne), view);
			} else if (typeof handler === "object" && typeof data === "object") {
				h.objectEach(data, function (topic, value) {
					if (typeof handler[topic] !== "undefined") {
						usedHandler = true;
						topics.push(topic);
						handle(handler[topic], value, this.parallel(), view);
					}
				}, this);

				if (!usedHandler) {
					throw new Error("no api called");
				}
			}
		}, h.sF(function (results) {
			var result = {};

			var i;
			for (i = 0; i < results.length; i += 1) {
				result[topics[i]] = results[i];
			}

			this.ne(result);
		}), fn);
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
				data.sid = view.getSession().getSID();
				data.userid = view.getSession().getUserID();
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
