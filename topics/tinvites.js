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
	requestWithMail: function (data, fn) {
		step(function () {
			invites.addRequestMail(data.mail, this);
		}, h.sF(function () {
			this.ne({});
		}), fn);
	},
	acceptRequest: function (data, fn, request) {
		step(function () {
			invites.acceptRequest(request, data.code, this);
		}, h.sF(function (success) {
			this.ne({ success: success });
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
	},
	checkCode: function (data, fn) {
		step(function () {
			invites.checkCode(data.inviteCode, this);
		}, h.sF(function (valid) {
			this.ne({
				valid: valid
			});
		}), fn);
	},
};

invite.requestWithMail.noLoginNeeded = true;
invite.checkCode.noLoginNeeded = true;

module.exports = invite;