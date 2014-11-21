"use strict";

var step = require("step");
var h = require("whispeerHelper");

var invites = require("../includes/invites");

var invite = {
	byMail: function (data, fn, view) {
		step(function () {
			view.logedinError(this);
		}, h.sF(function () {
			invites.byMail(view, data.mails, data.name, this);
		}), h.sF(function () {
			this.ne({});
		}), fn);
	},
	generateCode: function (data, fn, view) {
		step(function () {
			invites.generateCode(view, this);
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

module.exports = invite;