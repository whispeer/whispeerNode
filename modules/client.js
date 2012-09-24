"use strict";

var clientcount = 0;

var Client = function (request, handler, listener) {
	var responses = {};
	var doneListeners = {};

	var Session = require("./session");

	var helper = require("./helper").helper;
	var logger = require("./logger").logger;
	var step = require("Step");

	var getClientIDHelper = function (clientid) {
		return function () {
			return clientid;
		};
	};

	clientcount += 1;
	this.getClientID = getClientIDHelper(clientcount);

	this.send = function (data) {
		if (typeof listener === "function") {
			listener(data);
		}
	};

	this.close = function () {
		listener = null;
	};

	this.canSend = function () {
		return helper.isset(listener);
	};

	var clientSession = new Session(this);

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
				function startHandlers() {
					var action;
					for (action in data) {
						if (data.hasOwnProperty(action)) {
							if (typeof handler[action] === "function") {
								if (!helper.isset(responses[hid][action])) {
									responses[hid][action] = {};
								}

								logger.log("Handling action: " + action, logger.NOTICE);

								var View = require("./view.js");
								var theView = new View(theClient, hid, action, data, responses);

								handler[action](this.parallel(), theView);
							} else {
								logger.log("Invalid action received: " + action, logger.ERROR);
								responses[hid][action] = false;
								var done = this.parallel();
								done();
							}
						}
					}
				},
				function done(err) {
					if (err) {
						logger.log("PROBLEM!");
						logger.log(err, logger.ERROR);
						logger.trace();
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

	this.error = function (hid, error) {
		responses[hid] = {'status': 0};

		if (typeof error === "string") {
			responses[hid][error] = 1;
			responses[hid].error = error;
		}

		doneListeners[hid]();
	};

	this.getSession = function () {
		return clientSession;
	};

	this.getResponse = function (hid) {
		var answer = JSON.stringify(responses[hid]);
		return answer;
	};
};

exports.Client = Client;