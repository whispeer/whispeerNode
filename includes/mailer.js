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

var Bluebird = require("bluebird");
var readFile = Bluebird.promisify(fs.readFile, {
    context: fs
});

var settingsAPI = require("./settings");

var errorService = require("./errorService");

//mail
//- <userid>
//-- mails set
//-- currentMail
//-- <mail>Verified 1
//-- <mail>Challenge <challenge>

var TEMPLATEDIR = "./mailTemplates/_build/";

var languages = ["en", "de"];

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
	isMailActivatedForUser: function (user, mail, cb, overwrite, overwriteVerified) {
		step(function () {
			this.parallel.unflatten();

			client.sismember("mail:" + user.getID(), mail, this.parallel());
			settingsAPI.getUserSettings(user.getID(), this.parallel());
		}, h.sF(function (verified, settings) {
			this.ne((verified || overwriteVerified) && (settings.server.mailsEnabled || overwrite));
		}), cb);
	},
	generateTrackingCode: function (variables, cb) {
		var resultCode;

		step(function () {
			code(20, this);
		}, h.sF(function (_code) {
			resultCode = _code;
			client.sadd("analytics:mail:trackingCodes", resultCode, this);
		}), h.sF(function (inserted) {
			if (inserted) {
				client.set("analytics:mail:trackingCodes:" + resultCode, JSON.stringify(variables), this);
			} else {
				mailer.generateTrackingCode(variables, cb);
			}
		}), h.sF(function () {
			this.ne(resultCode);
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
				settingsAPI.updateServer(challengeData.user, "mailsEnabled", mailsEnabled, this.parallel());
				client.multi()
					.sadd("mail:" + challengeData.user, challengeData.mail)
					.srem("mail:codes", challenge)
					.del("mail:challenges:" + challenge)
					.exec(this.parallel());
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

					mailer.sendUserMail(user, "verification", {
						challenge: challenge
					}, this.parallel(), true, true);

				m.exec(this.parallel());
			} else {
				this.last.ne();
			}
		}), cb);
	},
	sendInteractionMails: function (users, type, subType, interactionObj, options) {
		var sendUserMail = Bluebird.promisify(mailer.sendUserMail, {
			context: mailer
		});

		console.log("sending interaction mail to users: " + users.map(function (user) {
			return user.getID();
		}));

		return Bluebird.resolve(users).filter(function (user) {
			if (options && options.sendMailWhileOnline) {
				return true;
			}

			var isOnline = Bluebird.promisify(user.isOnline, {
				context: user
			});

			return Bluebird.all([
				client.sismemberAsync("mail:notifiedUsers", user.getID()),
				isOnline()
			]).spread(function (alreadyNotified, isOnline) {
				console.log("User " + user.getID() + " mail status: " + alreadyNotified + " - " + isOnline);

				return !isOnline && !alreadyNotified;
			});
		}).each(function (user) {
			return client.saddAsync("mail:notifiedUsers", user.getID()).then(function () {
				return sendUserMail(user, ["interaction", type, subType], interactionObj);
			});
		});
	},
	tryNextTemplate: function (templateName, language) {
		return function (e) {
			if (templateName.length === 1) {
				return e;
			}

			if (e) {
				console.log("unable to find matching template:" + templateName.join("-"));
				templateName.pop();
			}

			return readFile(TEMPLATEDIR + language + "/" + templateName.join("-") + ".html").catch(mailer.tryNextTemplate(templateName, language));
		};
	},
	getCorrectTemplate: function (templateName, language, cb) {
		var resultPromise;

		if (typeof templateName === "string") {
			resultPromise = readFile(TEMPLATEDIR + language + "/" + templateName + ".html");
		} else {
			resultPromise = mailer.tryNextTemplate(templateName, language)();
		}

		return step.unpromisify(resultPromise, cb);
	},
	fillTemplate: function (templateName, variables, cb) {
		step(function () {
			var language = variables.language;

			if (languages.indexOf(language) === -1) {
				language = languages[0];
			}

			this.parallel.unflatten();

			mailer.getCorrectTemplate(templateName, language, this.parallel());
			mailer.generateTrackingCode(variables, this.parallel());
		}, h.sF(function (content, trackingCode) {
			content = content.toString();

			variables.host = variables.host || config.remoteHost || config.host;
			variables.server = config.serverUrl;

			variables.tracking = trackingCode;

			var inExpression = false;
			var sawFirstBracket = false;

			var result = "";
			var expression = "";

			var vm = require("vm");

			for (var i = 0; i < content.length; i++) {
				if (inExpression) {
					if (content[i] === "]" && content[i+1] === "]") {
						result += vm.runInNewContext(expression, variables);

						inExpression = false;
						expression = "";
						i += 1;
					} else {
						expression += content[i];
					}
				} else if (content[i] === "[" && content[i+1] === "[") {
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
	sendUserMail: function (user, templateName, variables, cb, overwriteActive, overwriteVerified) {
		console.log("Sending mail to user: " + user.getID());
		var receiver;
		step(function () {
			this.parallel.unflatten();

			user.getEMail(socketDataCreator.logedinStub, this.parallel());
			settingsAPI.getUserSettings(user.getID(), this.parallel());
			user.getNames(socketDataCreator.logedinStub, this.parallel());
		}, h.sF(function (_receiver, settings, names) {
			variables.name = names.firstName || names.lastName || names.nickname;

			if (settings && settings.meta) {
				variables.language = settings.meta.uiLanguage || settings.meta.initialLanguage;
			}

			receiver = _receiver;
			mailer.isMailActivatedForUser(user, receiver, this, overwriteActive, overwriteVerified);
		}), h.sF(function (activated) {
			if (activated) {
				mailer.sendMail(receiver, templateName, variables, this);
			} else {
				console.log("Mail not activated for user: " + user.getID());
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
			}, errorService.criticalError);

			this.ne(true)
		}), cb);
	},
	mailAdmin: function (subject, text, cb) {
		var mailOptions = {
			from: defaultFrom,
			to: "whispeerErrors@ovt.me",
			subject: subject.toString(),
			text: text.toString()
		};

		var sendMailAsync = Bluebird.promisify(mail.sendMail, {
			context: mail
		});

		return sendMailAsync(mailOptions).nodeify(cb);
	}
};

mailer.mailAdmin("Server Booted", "Test Mail to Display Server Bootup");

module.exports = mailer;
