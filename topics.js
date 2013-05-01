"use strict";

var whispeerAPI = {
	salt: function (data, fn) {
		console.log(data);
		if (data.identifier) {
			step(function () {
				var User = require("includes/user");
				User.getUser(data.identifier, this);
			}, h.hEsF(function (myUser) {
				myUser.getSalt(this);
			}), function (e, salt) {
				if (e) {
					if (e instanceof UserNotExisting) {
						fn.error({userNotExisting: true});
					} else {
						fn.error();
					}

					return;
				}

				this({salt: salt});
			}, fn);
		} else {
			fn.error.protocol();
		}
	},
	login: function (data, fn) {
		console.log(data);
		fn({result: "success"});
	}
};

module.exports = whispeerAPI;