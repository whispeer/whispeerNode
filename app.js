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

	//TODO: think about errors going back.
	function handle(handler, data, fn) {
		var topics;
		step(function () {
			if (typeof handler === "function") {
				handler(data, new HandlerCallback(this.last));
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

			this(result);
		}, fn);
	}

	function handleF(handler) {
		return function handleF(data, fn) {
			handle(handler, data, fn);
		};
	}

	var topic;
	for (topic in topics) {
		if (topics.hasOwnProperty(topic)) {
			socket.on(topic, handleF(topics[topic]));
		}
	}

	socket.on('error', function () {
		console.log(arguments);
	});

	socket.on('disconnect', function () {
		console.log("client disconnected");
	});
});