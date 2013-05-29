"use strict";

/*process.on('uncaughtException', function (err) {
    console.error('An uncaughtException was found, the program will end.');
    //hopefully do some logging.

	console.error(err);

    process.exit(1);
});*/

var io = require('socket.io').listen(3000);

io.sockets.on('connection', function (socket) {
	console.log("connection received");

	var HandlerCallback = require("./includes/handlerCallback");
	var topics = require('./topics.js');
	var step = require('step');

	var Session = require("./includes/session");

	var session = new Session();

	var View = require("./includes/view");
	var myView = new View(socket, session);

	function handle(handler, data, fn) {
		var topics;
		step(function () {
			if (typeof handler === "function") {
				handler(data, new HandlerCallback(this.last.ne));
			} else if (typeof handler === "object" && typeof data === "object") {
				var topic;
				for (topic in data) {
					if (data.hasOwnProperty(topic) && handler[topic] !== undefined) {
						topics.push(topic);
						handle(handler[topic], data, this.parallel());
					}
				}
			}
		}, function (err, results) {
			var result = {};

			var i;
			for (i = 0; i < results.length; i += 1) {
				result[topics[i]] = results[i];
			}

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

	socket.on('error', function () {
		console.error(arguments);
	});

	socket.on('disconnect', function () {
		//unregister listener
		console.log("client disconnected");
	});
});