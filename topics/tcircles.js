"use strict";

var step = require("step");
var h = require("whispeerHelper");
var Circle = require("../includes/circle");

var f = {
	getAll: function getAllF(data, fn, view) {
		step(function () {
			Circle.getAll(view, this);
		}, h.sF(function (results) {
			var i;
			for (i = 0; i < results.length; i += 1) {
				results[i].getData(view, this.parallel(), data.fullKey);
			}

			if (results.length === 0) {
				this.ne([]);
			}
		}), h.sF(function (results) {
			this.ne({
				circles: results
			});
		}), fn);
	},
	get: function get(data, fn, view) {
		step(function () {
			Circle.get(view, data.circleid, this);
		}, h.sF(function (result) {
				result.getData(view, this, data.fullKey);
		}), h.sF(function (result) {
			this.ne({
				circle: result
			});
		}), fn);
	},
	addUser: function addUserF(data, fn, view) {
		step(function () {
			Circle.addUser(view, data.add, this);
		}, h.sF(function (added) {
			this.ne({
				added: !!added
			});
		}), fn);
	},
	add: function addCircleF(data, fn, view) {
		step(function () {
			Circle.create(view, data.circle, this);
		}, h.sF(function (circle) {
			circle.getData(view, this);
		}), h.sF(function (data) {
			this.ne({
				result: data
			});
		}), fn);
	}
};

module.exports = f;