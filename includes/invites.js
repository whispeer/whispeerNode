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
					.hset("invites:active", inviteCode, request.session.getUserID(), this)
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
			if (name) {
				name = name.replace(/[^\w\s]/);
			} else {
				name = false;
			}

			if (mails.length === 0) {
				this.last.ne();
			}

			invites.generateCode(request, this);
		}, h.sF(function (inviteCode) {
			mails.forEach(function (mail) {
				mailer.sendMail(mail, "invite", {
					name: name,
					inviteCode: inviteCode
				}, this.parallel());
			}, this);
		}), cb);
	},
	useCode: function (myUser, inviteCode, cb) {
		step(function () {
			//bind new user to old user
			client.hget("invites:active", inviteCode, this);
		}, h.sF(function (user) {
			if (user) {
				myUser.addFriendRecommendation(user, this);
			} else {
				this.ne();
			}
		}), cb);
	}
};

module.exports = invites;
