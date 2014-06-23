"use strict";

var step = require("step");
var h = require("whispeerHelper");
var Circle = require("../includes/circle");

var f = {
	getAll: function getAllF(data, fn, request) {
		step(function () {
			Circle.getAll(request, this);
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
	removeCircle: function removeCircleF(data, fn, request) {
		step(function () {
			Circle.get(request, data.remove.circleid, this);
		}, h.sF(function (circle) {
			circle.remove(request, this);
		}), h.sF(function (success) {
			this.ne({remove: success});
		}), fn);
	},
	removeUsers: function removeUsersF(data, fn, request) {
		step(function () {
			Circle.get(request, data.remove.circleid, this);
		}, h.sF(function (circle) {
			circle.removeUsers(request, data.remove.key, data.remove.oldKeyDecryptor, data.remove.user, data.remove.remove, this);
		}), h.sF(function (success) {
			this.ne({
				removed: success
			});
		}), fn);

		/**
						circle: {
							key: keyData,
							remove: uids,
							user: userIDs,
						}
		*/
	},
	get: function get(data, fn, request) {
		step(function () {
			Circle.get(request, data.circleid, this);
		}, h.sF(function (result) {
				result.getData(request, this, data.fullKey);
		}), h.sF(function (result) {
			this.ne({
				circle: result
			});
		}), fn);
	},
	addUsers: function addUserF(data, fn, request) {
		step(function () {
			Circle.get(request, data.add.circleid, this);
		}, h.sF(function (circle) {
			circle.addUsers(request, data.add.userids, data.add.decryptors, this);
		}), h.sF(function (added) {
			this.ne({
				added: !!added
			});
		}), fn);
	},
	add: function addCircleF(data, fn, request) {
		step(function () {
			Circle.create(request, data.circle, this);
		}, h.sF(function (circle) {
			circle.getData(request, this);
		}), h.sF(function (data) {
			this.ne({
				result: data
			});
		}), fn);
	}
};

module.exports = f;