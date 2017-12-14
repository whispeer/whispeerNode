"use strict";

var step = require("step");
var h = require("whispeerHelper");

var invites = require("../includes/invites");

var invite = {
	byMail: function (data, fn, request) {
		step(function () {
			invites.byMail(request, data.mails, data.name, data.language, this);
		}, h.sF(function () {
			this.ne({});
		}), fn);
	},
	getMyInvites: function (data, fn, request) {
		step(function () {
			invites.getMyInvites(request, this);
		}, h.sF(function (invites) {
			this.ne({
				invites: invites
			});
		}), fn);
	},
	activateCode: function (data, fn) {
		step(function () {
			invites.activateCode(data.code, data.reference, this);
		}, fn);
	},
	generateCode: function (data, fn, request) {
		step(function () {
			return invites.generateCode(request, data.reference || "", data.active);
		}, h.sF(function (code) {
			this.ne({
				inviteCode: code
			});
		}), fn);
	}
};

module.exports = invite;
