"use strict";

if (typeof (ssn) === "undefined") {
	var ssn = {};
}

var helper = require("./helper.js").helper;
var sys = require('sys');

ssn.logger = {
	ALL: 0,
	NOTICE: 1,
	BASIC: 2,
	WARNING: 3,
	ERROR: 4,

	logLevel: 0,

	logError: function (toLog) {
		this.log(toLog);
	},
	log: function (toLog, logLevel) {
		if (!helper.isset(logLevel) || this.logLevel <= logLevel) {
			if (toLog === null) {
				console.trace();
			} else if (typeof toLog === "string" || typeof toLog === "number" || typeof toLog === "boolean") {
				try {
					console.log(toLog);
				} catch (e) {}
			} else if (typeof toLog === "object") {
				try {
					if (toLog instanceof Error) {
						console.log(toLog.stack);
					} else {
						sys.puts(sys.inspect((toLog)));
					}
				} catch (e2) {}
			}
		}
	},

	trace: function () {
		console.trace();
	}
};

exports.logger = ssn.logger;