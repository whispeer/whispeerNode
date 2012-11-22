"use strict";

var clientcount = 0;

var NoSendAvailable = require("./exceptions.js").NoSendAvailable;

/** create a new client object.
* @param request request object created by http object or websocket object not yet used
* @param handler controls how which request is handled
* @param listener called when new data for the client is ready to be send
*/
var Client = function (request, handler, listener) {
	if (typeof request === "undefined" || typeof handler === "undefined") {
		throw new Error("we need a handler");
	}

	var responses = {};
	var doneListeners = {};

	var Session = require("./session");

	var helper = require("./helper").helper;
	var logger = require("./logger").logger;
	var step = require("step");

	var getClientIDHelper = function (clientid) {
		return function () {
			return clientid;
		};
	};

	clientcount += 1;
	this.getClientID = getClientIDHelper(clientcount);

	/** send some data to this client
	* @param data data to send
	* sends the data to the client
	* @throws NoSendAvailable if just a request client
	*/
	this.send = function (data) {
		if (typeof listener === "function") {
			listener(data);
		} else {
			throw new NoSendAvailable("not able to send to this client");
		}
	};

	/** close the connection */
	this.close = function () {
		listener = null;
	};

	/** can you send data to this client? */
	this.canSend = function () {
		return helper.isset(listener);
	};

	/** new session */
	var clientSession = new Session(this);

	/** handle some request
	* @param doneListener callback called when handling is done
	* @param jsonData data to handle
	* @param hid handler id. necessary if multiple handlings can be called on one client
	*/
	this.handle = function (doneListener, jsonData, hid) {
		if (!helper.isset(hid)) {
			hid = 0;
		}

		responses[hid] = {};
		doneListeners[hid] = doneListener;

		var theClient = this;

		var data = {};
		try {
			data = JSON.parse(jsonData);
		} catch (e) {
			theClient.error(hid, "invalidjson");
			return;
		}

		try {
			if (helper.isset(data.rid)) {
				responses[hid].rid = data.rid;
				delete data.rid;
			}

			if (helper.isset(data.sid)) {
				theClient.getSession().setSID(data.sid);
			}

			delete data.sid;

			step(
				function handlerRunner() {
					var stepThis = this;
					var startHandlers = function (handler, data, curResponses, action, path) {
						if (typeof curResponses[action] === "undefined") {
							curResponses[action] = {};
						}

						/** check if we can handle the action in the current branch */
						if (typeof handler[action] === "function") {
							logger.log("Handling action: " + action, logger.NOTICE);

							var View = require("./view.js");
							var theView = new View(theClient, hid, action, data, curResponses);

							handler[action](stepThis.parallel(), theView);
						/** check if there might be more branches */
						} else if (typeof handler[action] === "object") {
							path.push(action);

							var newAction;
							for (newAction in data[action])  {
								if (data[action].hasOwnProperty(newAction)) {
									startHandlers(handler[action], data[action], curResponses[action], newAction, path);
								}
							}
						} else {
							logger.log("Invalid action received: " + action, logger.ERROR);
							curResponses[action] = false;
							var done = stepThis.parallel();
							done();
						}
					};

					var action;
					for (action in data) {
						if (data.hasOwnProperty(action)) {
							startHandlers(handler, data, responses[hid], action, []);
						}
					}
				},
				function done(err) {
					if (err) {
						logger.log("PROBLEM!", logger.ERROR);
						logger.log(err, logger.ERROR);
						theClient.error(hid);

						return;
					}

					doneListeners[hid]();
				}
			);
		} catch (e2) {
			logger.log(e2, logger.ERROR);
			theClient.error(hid);
		}
	};

	/** sets the response for hid to error with possibility to add more errors.
	* @param hid which request errored?
	* @param error what was the error?
	*/
	this.addError = function (hid, error) {
		if (!this.isError(hid)) {
			responses[hid] = {'status': 0};
		}


		if (typeof error === "string") {
			responses[hid][error] = 1;
			responses[hid].error = error;
		}
	};

	this.isError = function (hid) {
		return (typeof responses[hid] !== "undefined" && responses[hid].status === 0);
	};

	/** sets the response for hid to error
	* @param hid which request errored?
	* @param error what was the error?
	*/
	this.error = function (hid, error) {
		this.addError(hid, error);

		doneListeners[hid]();
	};

	/** get the session */
	this.getSession = function () {
		return clientSession;
	};

	/** get the response.
	* @param hid for which request?
	*/
	this.getResponse = function (hid) {
		var answer = JSON.stringify(responses[hid]);
		return answer;
	};
};

exports.Client = Client;