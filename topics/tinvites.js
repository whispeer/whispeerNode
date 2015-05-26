"use strict";

var step = require("step");
var h = require("whispeerHelper");

var invites = require("../includes/invites");

var invite = {
	byMail: function (data, fn, request) {
		step(function () {
			invites.byMail(request, data.mails, data.name, this);
		}, h.sF(function () {
			this.ne({});
		}), fn);
	},
	generateCode: function (data, fn, request) {
		step(function () {
			invites.generateCode(request, this);
		}, h.sF(function (code) {
			this.ne({
				inviteCode: code
			});
		}), fn);
	}
};

module.exports = invite;
