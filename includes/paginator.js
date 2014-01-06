"use strict";

var h = require("whispeerHelper");

var Paginator = function (start, count) {
	start = h.parseDecimal(start);
	count = h.parseDecimal(count);
	if (!h.isInt(start)) {
		start = 1;
	}

	if (!h.isInt(count)) {
		count = 20;
	}

	this.rangeBegin = function () {
		return start - 1;
	};

	this.rangeEnd = function () {
		return start + count - 1;
	};
};

module.exports = Paginator;