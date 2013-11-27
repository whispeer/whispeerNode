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
	removeUser: function removeUserF(data, fn, view) {
		step(function () {
			Circle.get(view, data.remove.circleid, this);
		}, h.sF(function (circle) {
			circle.removeUser(view, circle.key, circle.oldKeyDecryptor, circle.user, circle.remove, this);
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
	addUsers: function addUserF(data, fn, view) {
		step(function () {
			Circle.get(view, data.add.circleid, this);
		}, h.sF(function (circle) {
			circle.addUsers(view, data.add.userids, data.add.decryptors, this);
		}), h.sF(function (added) {
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