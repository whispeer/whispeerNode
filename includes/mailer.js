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

var fs = require("fs");

var mail = nodemailer.createTransport(config.mailType, config.mail);

var defaultFrom = config.mailFrom || "whispeer <support@whispeer.de>";

//mail
//- <userid>
//-- mails set
//-- currentMail
//-- <mail>Verified 1
//-- <mail>Challenge <challenge>

var TEMPLATEDIR = "./mailTemplates/_site/";

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

				mailer.sendMail(userMail, "verification", {
					challenge: challenge
				}, this.parallel());

				m.exec(this.parallel());
			} else {
				this.last.ne();
			}
		}), cb);
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
			usersToNotify.forEach(function (user) {
				mailer.sendUserMail(user, "interaction", {}, this.parallel());
			}, this);
		}), (cb || h.nop));
	},
	fillTemplate: function (templateName, variables, cb) {
		step(function () {
			fs.readFile(TEMPLATEDIR + templateName + ".html", this);
		}, h.sF(function (content) {
			content = content.toString();

			variables.host = variables.host || config.remoteHost || config.host;

			var inExpression = false;
			var sawFirstBracket = false;

			var result = "";
			var expression = "";

			var vm = require("vm");

			for (var i = 0; i < content.length; i++) {
				if (inExpression) {
					if (content[i] === ">" && content[i+1] === ">") {
						result += vm.runInNewContext(expression, variables);

						inExpression = false;
						expression = "";
						i += 1;
					} else {
						expression += content[i];
					}
				} else if (content[i] === "<" && content[i+1] === "<") {
					inExpression = true;
					i += 1;
				} else {
					result += content[i];
					sawFirstBracket = false;
				}
			}

			var cheerio = require("cheerio"),
				element = cheerio.load(result);

			var subject = element("title").text();

			this.ne(result, subject);
		}), cb);
	},
	sendUserMail: function (user, templateName, variables, cb) {
		var receiver;
		step(function () {
			user.getEMail(socketDataCreator.logedinStub, this);
		}, h.sF(function (_receiver) {
			receiver = _receiver;
			mailer.isMailActivatedForUser(user, receiver, this);
		}), h.sF(function (activated) {
			if (activated) {
				mailer.sendMail(receiver, templateName, variables, this);
			} else {
				this.last.ne(false);
			}
		}), cb);
	},
	sendMail: function (receiverAddress, templateName, variables, cb) {
		step(function () {
			mailer.fillTemplate(templateName, variables, this);
		}, h.sF(function (content, subject) {
			mail.sendMail({
				to: receiverAddress,
				from: defaultFrom,
				subject: subject,
				html: content,
				generateTextFromHTML: true
			}, this);
		}), cb);
	},
	mailAdmin: function (subject, text, cb) {
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
			if (cb) {
				cb(e);
			}
		});
	}
};

mailer.mailAdmin("Server Booted", "Test Mail to Display Server Bootup");

module.exports = mailer;
