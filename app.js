/*process.on('uncaughtException', function (err) {
    console.error('An uncaughtException was found, the program will end.');
    //hopefully do some logging.

	console.error(err);

    process.exit(1);
});*/

var io = require('socket.io').listen(3000);

io.sockets.on('connection', function (socket) {
	"use strict";
	console.log("connection received");

	var HandlerCallback = require("./includes/handlerCallback");
	var topics = require('./topics.js');
	var step = require('step');
	var h = require("./includes/helper");

	var Session = require("./includes/session");
	var session = new Session();

	var View = require("./includes/view");
	var myView = new View(socket, session);

	function handlePriorized(count, handler, data, view, cb) {
		var resultMain;
		var p = handler.priorized;

		step(function hp1() {
			if (typeof p !== "object" || !(p instanceof Array) || !p[count]) {
				this.last.ne({});
			} else if (data[p[count]]) {
				if (typeof handler[p[count]] === "function") {
					handler[p[count]](data, new HandlerCallback(this.ne), view);
				} else {
					throw "can not priorize a branch yet.";
				}
			} else {
				handlePriorized(count + 1, handler, data, view, cb);
			}
		}, h.sF(function hp2(result) {
			resultMain = result;

			handlePriorized(count + 1, handler, data, view, this);
		}), h.sF(function hp3(result) {
			result[p[count]] = resultMain;

			this.ne(result);
		}), cb);
	}

	function handle(handler, data, fn, view) {
		var topics = [], prioRes = {};
		step(function () {
			handlePriorized(0, handler, data, view, this);
		}, h.sF(function (priorizedResults) {
			prioRes = priorizedResults;
			if (typeof handler === "function") {
				handler(data, new HandlerCallback(this.last.ne), view);
			} else if (typeof handler === "object" && typeof data === "object") {
				var topic;
				for (topic in data) {
					if (data.hasOwnProperty(topic) && handler[topic] !== undefined && handler.priorized.indexOf(topic) === -1) {
						topics.push(topic);
						handle(handler[topic], data[topic], this.parallel(), view);
					}
				}
			}
		}), function (err, results) {
			var result = {};

			var i;
			for (i = 0; i < results.length; i += 1) {
				result[topics[i]] = results[i];
			}

			var extend = require("xtend");
			result = extend(result, prioRes);

			this.ne(result);
		}, fn);
	}

	/** adds data which is always present.
	* mainly adds login data
	*/
	function always(view, data, fn) {
		step(function () {
			view.logedin(this);
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
				data.sid = view.getSession().getSID()
			}

			this(data);
		}, fn);
	}

	function handleF(handler) {
		return function handleF(data, fn) {
			step(function () {
				handle(handler, data, this, myView);
			}, function (e, result) {
				always(myView, result, fn);
			});
		};
	}

	var topic;
	for (topic in topics) {
		if (topics.hasOwnProperty(topic)) {
			socket.on(topic, handleF(topics[topic]));
		}
	}

	socket.on("data", handleF(topics));

	socket.on('error', function () {
		console.error(arguments);
	});

	socket.on('disconnect', function () {
		//unregister listener
		console.log("client disconnected");
	});
});