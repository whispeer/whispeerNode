"use strict";

var step = require("step");
var h = require("./includes/helper");

require("./includes/errors.js");

var whispeerAPI = {
	salt: function getSalt(data, fn) {
		step(function () {
			if (data && data.identifier) {
				var User = require("./includes/user");
				User.getUser(data.identifier, this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (myUser) {
			myUser.getSalt(this);
		}), h.hE(function (e, salt) {
			if (e) {
				fn.error({userNotExisting: true});

				this.last.ne();
			}

			this.ne({salt: salt});
		}, UserNotExisting), fn);
	},
	login: function (data, fn) {
		console.log(data);
		fn(null, {result: "success"});
	}
};

module.exports = whispeerAPI;