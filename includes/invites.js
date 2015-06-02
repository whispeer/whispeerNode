"use strict";

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;
var client = require("./redisClient");
var mailer = require("./mailer");
var User = require("./user");

var Bluebird = require("bluebird");

var INVITELENGTH = 10;

var invites = {
	generateCode: function (request, reference, cb) {
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
				var userid = request.session.getUserID();

				//add code to list of codes created by current user
				client.multi()
					.hmset("invites:code:" + inviteCode, {
						user: userid,
						added: new Date().getTime(),
						reference: reference
					})
					.sadd("invites:user:" + userid, inviteCode)
					.exec(this);
			} else {
				invites.generateInviteCode(request, this);
			}
		}), h.sF(function () {
			this.ne(inviteCode);
		}), cb);
	},
	byMail: function (request, mails, name, cb) {
		var resultPromise = Bluebird.try(function () {
			if (name) {
				name = name.replace(/[^\w\s]/);
			} else {
				name = false;
			}

			return mails;
		}).map(function (mail) {
			var generateCode = Bluebird.promisify(invites.generateCode, mailer);

			return generateCode(request, mail).then(function (code) {
				return {
					code: code,
					mail: mail
				};
			});
		}).map(function (invite) {
			var sendMail = Bluebird.promisify(mailer.sendMail, mailer);
			sendMail(invite.mail, "invite", {
				name: name,
				inviteCode: invite.code
			});
		});

		if (cb) {
			step.unpromisify(resultPromise, cb);
		} else {
			return resultPromise;
		}
	},
	useCode: function (myUser, inviteCode, cb) {
		step(function () {
			client.hget("invites:code:" + inviteCode, "user", this);
		}, h.sF(function (user) {
			if (user) {
				User.getUser(user, this);
			} else {
				this.last.ne();
			}
		}), h.sF(function (otherUser) {
			client.sadd("invites:code:" + inviteCode + ":used", myUser.getID(), this.parallel());
			otherUser.addFriendRecommendation(myUser, 0, this.parallel());
			myUser.addFriendRecommendation(otherUser, 0, this.parallel());
		}), cb);
	}
};

module.exports = invites;
