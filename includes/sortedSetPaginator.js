"use strict";

var client = require("./redisClient");
var step = require("step");
var h = require("whispeerHelper");

function makeDefaultInt(value, defaultValue) {
	value = h.parseDecimal(value);

	if (!h.isInt(value)) {
		return defaultValue;
	}

	return value;
}

function SortedSetPaginator(key, count, noReverse) {
	count = makeDefaultInt(count, 20);

	this._key = key;
	this._count = count;
	this._noReverse = noReverse;
}

SortedSetPaginator.prototype.rangeBegin = function (start) {
	return Math.max(start, 0);
};

SortedSetPaginator.prototype.rangeEnd = function (start) {
	return Math.max(start + this._count, 0);
};

SortedSetPaginator.prototype.getRange = function (start, cb) {
	if (this._noReverse) {
		client.zrange(this._key, this.rangeBegin(start), this.rangeEnd(start), cb);
	} else {
		client.zrevrange(this._key, this.rangeBegin(start), this.rangeEnd(start), cb);
	}
};

SortedSetPaginator.prototype.getRangeAfterIndex = function (start, cb) {
	start = makeDefaultInt(start, -1) + 1;
	this.getRange(start, cb);
};

function filterArrayAsync(arr, filter, cb) {
	if (arr.length === 0) {
		cb(null, []);
	}

	step(function () {
		var i;
		for (i = 0; i < arr.length; i += 1) {
			filter(arr[i], this.parallel());
		}
	}, h.sF(function (inFilter) {
		var i, result = [];
		for (i = 0; i < arr.length; i += 1) {
			if (inFilter[i]) {
				result.push(arr[i]);
			}
		}

		this.ne(result);
	}), cb);
}

SortedSetPaginator.prototype.getFilteredRangeAfterIndex = function (start, filter, cb) {
	var thePaginator = this, result = [], end = false, loops = 0;
	start = makeDefaultInt(start, -1) + 1;

	function addBatch() {
		step(function () {
			thePaginator.getRange(start + loops * thePaginator._count, this);
		}, h.sF(function (result) {
			end = result.length < thePaginator._count;

			filterArrayAsync(result, filter, this);
		}), h.sF(function (filteredResult) {
			result = result.concat(filteredResult);

			if (result.length >= thePaginator._count || end || loops > 100) {
				this.ne(result.slice(0, thePaginator._count), !end);
			} else {
				loops++;

				addBatch();
			}
		}), cb);
	}

	addBatch();
};

SortedSetPaginator.prototype.getRangeAfterID = function (id, cb, filter) {
	var that = this;
	step(function () {
		if (that._noReverse) {
			client.zrank(that._key, id, this);
		} else {
			client.zrevrank(that._key, id, this);
		}
	}, h.sF(function (index) {
		if (!filter) {
			that.getRangeAfterIndex(index, this);
		} else {
			that.getFilteredRangeAfterIndex(index, filter, this);
		}
	}), cb);
};

module.exports = SortedSetPaginator;