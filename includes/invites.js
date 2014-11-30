"use strict";

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;
var client = require("./redisClient");
var mailer = require("./mailer");

var INVITELENGTH = 10;

var invites = {
	generateCode: function (request, cb) {
		var inviteCode;
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			//generate random invite code
			code(INVITELENGTH, this);
		}), h.sF(function (_inviteCode) {
			inviteCode = _inviteCode;
			//add invite code to list of all codes
			client.sadd("invites:all", inviteCode, this);
		}), h.sF(function (addedCount) {
			if (addedCount === 1) {
				//add code to not used list
				//add code to list of codes created by current user
				client.multi()
					.sadd("invites:unused", inviteCode)
					.sadd("invites:" + request.session.getUserID() + ":all", inviteCode)
					.exec(this);
			} else {
				invites.generateInviteCode(request, this);
			}
		}), h.sF(function () {
			this.ne(inviteCode);
		}), cb);
	},
	byMail: function (request, mails, name, cb) {
		step(function () {
			name = name.replace(/[^\w\s]/);

			if (mails.length === 0) {
				this.last.ne();
			}

			mails.forEach(function () {
				invites.generateCode(request, this.parallel());
			}, this);
		}, h.sF(function (inviteCodes) {
			mails.forEach(function (mail, i) {
				mailer.sendMail(mail, "invite", {
					name: name,
					inviteCode: inviteCodes[i]
				}, "Einladung zu whispeer" + (name ? " von " + name : ""), this.parallel());
			}, this);
		}), cb);
	},
	useCode: function (inviteCode, cb) {
		step(function () {
			//remove code from not used list
			client.srem("invites:unused", inviteCode, this);
		}, h.sF(function (removedCount) {
			this.ne(removedCount === 1);
		}), cb);
	},
	checkCode: function (inviteCode, cb) {
		client.sismember("invites:unused", inviteCode, cb);
	}
};

module.exports = invites;