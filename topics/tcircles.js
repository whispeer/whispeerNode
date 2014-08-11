"use strict";

var step = require("step");
var h = require("whispeerHelper");
var Circle = require("../includes/circle");

var f = {
	all: function getAllF(data, fn, request) {
		step(function () {
			Circle.all(request, this);
		}, h.sF(function (results) {
			var i;
			for (i = 0; i < results.length; i += 1) {
				results[i].getData(request, this.parallel(), data.fullKey);
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
	"delete": function removeCircleF(data, fn, request) {
		step(function () {
			Circle.get(request, data.remove.circleid, this);
		}, h.sF(function (circle) {
			circle.remove(request, this);
		}), h.sF(function (success) {
			this.ne({remove: success});
		}), fn);
	},
	update: function removeUsersF(data, fn, request) {
		step(function () {
			Circle.get(request, data.update.id, this);
		}, h.sF(function (circle) {
			//if we have got a key and decryptors handle them!
			circle.update(request, data.update.content, data.update.meta, data.update.key, data.update.decryptors, this);
		}), h.sF(function (success) {
			this.ne({
				updated: success
			});
		}), fn);
	},
	get: function get(data, fn, request) {
		step(function () {
			Circle.get(request, data.circleid, this);
		}, h.sF(function (result) {
			result.getData(request, this);
		}), h.sF(function (result) {
			this.ne({ circle: result });
		}), fn);
	},
	create: function createCircleF(data, fn, request) {
		step(function () {
			Circle.create(request, data.circle, this);
		}, h.sF(function (circle) {
			circle.getData(request, this);
		}), h.sF(function (data) {
			this.ne({ created: data });
		}), fn);
	}
};

module.exports = f;