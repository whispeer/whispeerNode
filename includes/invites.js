"use strict";

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;
var client = require("./redisClient");
var mailer = require("./mailer");
var User = require("./user");

var Bluebird = require("bluebird");

var Notification = require("./notification");

var INVITELENGTH = 10;


var escapeHtml = require("escape-html");

var invites = {
	generateCode: function (request, reference, active, cb) {
		var inviteCode;
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			//generate random invite code
			code(INVITELENGTH, this);
		}), h.sF(function (_inviteCode) {
			inviteCode = _inviteCode;
			//add invite code to list of all codes
			client.sadd("invites:v2:all", inviteCode, this);
		}), h.sF(function (addedCount) {
			if (addedCount === 1) {
				var userid = request.session.getUserID();

				//add code to list of codes created by current user
				client.multi()
					.hmset("invites:v2:code:" + inviteCode, {
						user: userid,
						added: new Date().getTime(),
						reference: reference,
						active: (active ? 1 : 0)
					})
					.sadd("invites:v2:user:" + userid, inviteCode)
					.exec(this);
			} else {
				invites.generateCode(request, reference, active, this);
			}
		}), h.sF(function () {
			this.ne(inviteCode);
		}), cb);
	},
	activateCode: function (inviteCode, reference, cb) {
		step(function () {
			client.sismember("invites:v2:all", inviteCode, this);
		}, h.sF(function (isMember) {
			if (isMember) {
				client.hset("invites:v2:code:" + inviteCode, "active", 1, this);
				if (reference) {
					client.hset("invites:v2:code:" + inviteCode, "reference", reference, this);
				}
			} else {
				this.ne();
			}
		}), cb);
	},
	getMyInvites: function (request, cb) {
		var logedinError = Bluebird.promisify(request.session.logedinError, {
		    context: request.session
		});

		const rand = Math.random()

		console.time(`f${rand}`)

		return logedinError().then(function () {
			console.timeEnd(`f${rand}`)
			console.time(`g${rand}`)

			return client.smembersAsync("invites:v2:user:" + request.session.getUserID());
		}).map(function (inviteCode) {
			console.timeEnd(`g${rand}`)
			console.time(`h${rand}`)

			return Bluebird.all([
				client.hgetallAsync("invites:v2:code:" + inviteCode),
				client.smembersAsync("invites:v2:code:" + inviteCode + ":used")
			]).spread(function (data, usedBy) {
				console.timeEnd(`h${rand}`)
				console.time(`i${rand}`)

				data.usedBy = usedBy;
				data.code = inviteCode;
				return data;
			});
		}).filter(function (inviteData) {
			console.timeEnd(`i${rand}`)

			return inviteData.active === "1";
		}).nodeify(cb);
	},
	byMail: function (request, mails, name, language, cb) {
		var resultPromise = Bluebird.try(function () {
			if (name) {
				name = escapeHtml(name);
			} else {
				name = false;
			}

			return mails;
		}).map(function (mail) {
			var generateCode = Bluebird.promisify(invites.generateCode, {
			    context: mailer
			});

			return generateCode(request, mail, true).then(function (code) {
				return {
					code: code,
					mail: mail
				};
			});
		}).map(function (invite) {
			var sendMail = Bluebird.promisify(mailer.sendMail, {
			    context: mailer
			});
			sendMail(invite.mail, "invite", {
				name: name,
				language: language,
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
			client.hget("invites:v2:code:" + inviteCode, "user", this);
		}, h.sF(function (user) {
			if (user) {
				User.getUser(user, this);
			} else {
				this.last.ne();
			}
		}), h.sF(function (otherUser) {
			Notification.add([otherUser], "invite", "accepted", myUser.getID());

			client.sadd("invites:v2:code:" + inviteCode + ":used", myUser.getID(), this.parallel());
			client.hset("invites:v2:code:" + inviteCode, "active", 1, this.parallel());
			otherUser.addFriendRecommendation(myUser, 0, this.parallel());
			myUser.addFriendRecommendation(otherUser, 0, this.parallel());
		}), cb);
	}
};

module.exports = invites;
