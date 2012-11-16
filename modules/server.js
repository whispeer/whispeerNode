"use strict";
var WebSocketServer = require('websocket').server;
var http = require('http');
var step = require("step");

/** own logger module */
var logger = require("./logger.js").logger;

function start(handler, port) {
	logger.log("Starting server!", logger.BASIC);

	var server;
	server = http.createServer(function (request, response) {
		var postData, theClient;
		try {
			logger.log("HTTP Connection opened!", logger.NOTICE);

			var Client = require("./client.js").Client;
			theClient = new Client(request, handler);
		} catch (e) {
			logger.log(e, logger.ERROR);
			return;
		}

		step(
			function start() {
				request.setEncoding("utf8");

				request.addListener("data", function (postDataChunk) {
					postData += postDataChunk;
				});

				request.addListener("end", this);
			},
			function handlePostData(err) {
				if (err) {
					throw err;
				}

				theClient.handle(this, postData, 0);
			},
			function handled(err) {
				if (err) {
					throw err;
				}

				response.writeHead(200, {"Content-Type": "text/plain"});
				response.write(theClient.getResponse(0));
				response.end();
			},
			function done(err) {
				if (err) {
					response.write('{"status":0}');
					logger.log(err, logger.ERROR);
				}
			}
		);
	});

	server.listen(port, function () {
		logger.log("listening!", logger.NOTICE);
	});

	var wsServer = new WebSocketServer({
		httpServer: server
	});

	// WebSocket server
	wsServer.on('request', function (request) {
		var connection;
		try {
			logger.log("New Socket Client!", logger.NOTICE);
			connection = request.accept(null, request.origin);

			var hid = 0;

			var Client = require("./client.js").Client;
			var theClient = new Client(request, handler, function (data) {
				connection.send(data);
			});

			var answerFunc = function (hid) {
				return function () {
					logger.log("answer ready:", logger.NOTICE);
					logger.log(theClient.getResponse(hid), logger.NOTICE);
					connection.send(theClient.getResponse(hid));
				};
			};

			// This is the most important callback for us, we'll handle
			// all messages from users here.
			connection.on('message', function (message) {
				if (message.type === 'utf8') {
					hid += 1;
					logger.log("Request: " + message.utf8Data, logger.NOTICE);
					theClient.handle(answerFunc(hid), message.utf8Data, hid);
				}
			});

			connection.on('close', function (connection) {
				// close user connection
				theClient.close();
			});
		} catch (e) {
			logger.log(e, logger.ERROR);
			if (typeof connection === "object") {
				connection.close();
			}
		}
	});
}

exports.start = start;