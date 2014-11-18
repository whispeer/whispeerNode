"use strict";

var nodemailer = require("nodemailer");
var User = require("./user");

var configManager = require("./configManager");
var config = configManager.get();
var client = require("./redisClient");
var socketDataCreator = require("./socketData");

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;

var mail = nodemailer.createTransport(config.mailType, config.mail);

var defaultFrom = config.mailFrom || "support@whispeer.de";

//mail
//- <userid>
//-- mails set
//-- currentMail
//-- <mail>Verified 1
//-- <mail>Challenge <challenge>

function generateChallenge(cb) {
	var challenge;
	step(function () {
		code(20, this);
	}, h.sF(function (code) {
		challenge = code;
		client.sadd("mail:codes", challenge, this);
	}), h.sF(function (added) {
		if (added !== 1) {
			generateChallenge(cb);
		} else {
			this.ne(challenge);
		}
	}), cb);
}

var mailer = {
	isMailActivatedForUser: function (user, mail, cb) {
		step(function () {
			this.parallel.unflatten();

			client.sismember("mail:" + user.getID(), mail, this.parallel());
			client.hget("settings:" + user.getID(), "mailsEnabled", this.parallel());
		}, h.sF(function (verified, mailsEnabled) {
			this.ne(verified && mailsEnabled === "1");
		}), cb);
	},
	verifyUserMail: function (challenge, mailsEnabled, cb) {
		var challengeData;
		step(function () {
			client.hgetall("mail:challenges:" + challenge, this);
		}, h.sF(function (data) {
			if (data) {
				challengeData = data;
				User.getUser(challengeData.user, this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function (user) {
			if (user && user.getID() === h.parseDecimal(challengeData.user)) {
				user.getEMail(socketDataCreator.logedinStub, this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function (userMail) {
			if (userMail === challengeData.mail) {
				client.multi()
					.sadd("mail:" + challengeData.user, challengeData.mail)
					.srem("mail:codes", challenge)
					.del("mail:challenges:" + challenge)
					.hset("settings:" + challengeData.user, "mailsEnabled", (mailsEnabled ? 1 : 0))
					.exec(this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	},
	sendAcceptMail: function (user, cb) {
		var challenge;
		step(function () {
			generateChallenge(this);
		}, h.sF(function (code) {
			challenge = code;

			user.getEMail(socketDataCreator.logedinStub, this);
		}), h.sF(function (userMail) {
			if (userMail) {
				var m = client.multi();
				m
					.hmset("mail:challenges:" + challenge, {
						user: user.getID(),
						mail: userMail
					})
					.expire("mail:challenges:" + challenge, 7*24*60*60);

				var mailOption = {
					from: defaultFrom,
					to: userMail,
					subject: "[Whispeer] E-Mail Verifizierung",
					text: "Bitte verifiziere deine E-Mail Adresse!\nUm deine E-Mail zu aktivieren klicke bitte auf den folgenden Link: " + config.host + "/verifyMail/" + challenge
				};

				mail.sendMail(mailOption, this.parallel());
				m.exec(this.parallel());
			} else {
				this.last.ne();
			}
		}), cb);
	},
	delaySendMails: function () {
		var args = arguments;
		step(function () {
			process.nextTick(this);
		}, function () {
			mailer.sendMails.apply(mailer, args);
		});
	},
	sendInteractionMails: function (users, cb) {
		var usersToNotify;

		step(function () {
			users.forEach(function (user) {
				client.sismember("mail:notifiedUsers", user.getID(), this.parallel());
			}, this);
		}, h.sF(function (notified) {
			usersToNotify = users.filter(function (user, i) {
				return !notified[i];
			});

			usersToNotify.forEach(function (user) {
				client.sadd("mail:notifiedUsers", user.getID(), this.parallel());
			}, this);
		}), h.sF(function () {
			mailer.sendMails(usersToNotify, "[Whispeer] Neue Interaktionen", "Jemand hat mit dir auf Whispeer interagiert!\nBesuche " + config.host + " um zu sehen wer mit dir interagiert hat.\n\nMit freundlichen Grüßen,\nDein Whispeer Team!", this);
		}), (cb || h.nop));
	},
	sendMails: function (users, subject, text, cb) {
		//todo: add inReplyTo and messageID!
		var mails;

		step(function () {
			if (users.length === 0) {
				this.last.ne();
			}

			users.forEach(function (user) {
				user.getEMail(socketDataCreator.logedinStub, this.parallel());
			}, this);
		}, h.sF(function (theMails) {
			mails = theMails;

			users.forEach(function (user, i) {
				if (mails[i]) {
					mailer.isMailActivatedForUser(user, mails[i], this.parallel());
				} else {
					this.parallel()();
				}
			}, this);
		}), h.sF(function (verified) {
			//TODO: text replacements (e.g. user name!)
			users.forEach(function (user, i) {
				if (verified[i]) {
					mail.sendMail({
						from: defaultFrom,
						to: mails[i],
						subject: subject.toString(),
						text: text.toString()
					});
				}
			});

			this.ne();
		}), (cb || h.nop));
	},
	mailAdmin: function (subject, text) {
		var mailOptions = {
			from: defaultFrom,
			to: "whispeerErrors@ovt.me",
			subject: subject.toString(),
			text: text.toString()
		};

		mail.sendMail(mailOptions, function (e) {
			if (e) {
				console.log(e);
			}
		});
	}
};

mailer.mailAdmin("Server Booted", "Test Mail to Display Server Bootup");

module.exports = mailer;
