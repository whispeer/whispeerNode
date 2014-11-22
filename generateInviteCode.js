"use strict";

var invites = require("./includes/invites");

var viewStub = {
	logedinError: function (cb) { cb(); },
	getUserID: function () { return -1; }
};


invites.generateCode(viewStub, function (e, c) {
	if (e) {
		throw e;
	}

	console.log(c);
	process.exit();
});