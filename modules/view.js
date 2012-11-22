"use strict";
var logger = require("./logger.js").logger;

/** a view, which has all data for currently to handle action */
var view = function (theClient, hid, action, data, responses) {
	/** get current client */
	this.getClient = function () {
		return theClient;
	};

	this.error = function (err) {
		theClient.error(hid, err);
	};

	this.addError = function (err) {
		theClient.addError(hid, err);
	};

	this.isError = function () {
		return theClient.isError(hid);
	};

	/** get current session */
	this.getSession = function () {
		return this.getClient().getSession();
	};

	/** get user id */
	this.getUserID = function () {
		return this.getSession().getUserID();
	};

	/** what data do we have to handle */
	this.getData = function () {
		return data[action];
	};

	/** get current handle id */
	this.getHID = function () {
		return hid;
	};

	/** get current handle (response object by hid and action)*/
	this.getHandle = function () {
		return responses[action];
	};

	/** set value in response object by hid, action, key.
	* @param key key to set.
	* @param val value to set to
	* @author Nilos
	*/
	this.setValue = function (key, val) {
		logger.log("setVal: " + key + " = " + val, logger.NOTICE);
		responses[action][key] = val;
	};
};

module.exports = view;