"use strict";

var step = require("step");
var h = require("./helper");
var client = require("./client");

require("./errors");

var Session = function Session() {
	/** how long is the session id */
	var SESSIONKEYLENGTH = 30;
	/** how long till automatic logout */
	var ONLINETIME = 10 * 60;
	/** session id, userid, are we loged in, time we logged in, stay forever? */
	var sid, userid = 0, logedin = false, time = 0, stay = 0;

	/** closure thingie */
	var theSession = this;

	/** get a session id
	* @param callback called with result (sid)
	* @callback	(err, sid) error and session id
	* @author Nilos
	*/
	var createSession = function (callback) {
		console.log("Create Session!");

		var tempSID;

		step(function generate() {
			h.code(SESSIONKEYLENGTH, this);
		}, h.sF(function (theSID) {
			console.log("Generated SID:" + theSID);

			tempSID = theSID;

			client.setnx("session:" + tempSID, this);
		}), h.sF(function (set) {
			if (set === 1) {
				this.ne(tempSID);
			} else {
				createSession(this.last);
				return;
			}
		}), callback);
	};
};
module.exports = Session;