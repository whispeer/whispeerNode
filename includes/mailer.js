var nodemailer = require("nodemailer");
var User = require("./user");

var fs = require("fs");
var path = require("path");
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config.json")));
var client = require("./redisClient");
var viewCreator = require("./view");

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;

var mailOptions = {
    from: "Fred Foo ✔ <foo@blurdybloop.com>", // sender address
    to: "bar@blurdybloop.com, baz@blurdybloop.com", // list of receivers
    subject: "Hello ✔", // Subject line
    text: "Hello world ✔", // plaintext body
    html: "<b>Hello world ✔</b>" // html body
};

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
	verifyUserMail: function (challenge, cb) {
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
				user.getEMail(viewCreator.logedinViewStub, this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function (userMail) {
			if (userMail === challengeData.mail) {
				client.multi()
					.hset("mail:" + challengeData.user, challengeData.mail + ":verified", 1)
					.sadd("mail:" + challengeData.user + ":all", challengeData.mail)
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

			user.getEMail(viewCreator.logedinViewStub, this);
		}), h.sF(function (userMail) {
			if (userMail) {
				var m = client.multi();
				m
					.hmset("mail:challenges:" + challenge, {
						user: user.getID(),
						mail: userMail
					})
					.expire("mail:challenges:" + challenge, 24*60);

				mail.sendMail({
					from: defaultFrom,
					to: mail,
					subject: "[Whispeer] Mail Verification",
					text: "Please Verifiy Your Mail! \r\nAcceptcode: " + challenge + "\r\n Accept-Url: " + config.host + "/lverifyMail/" + code
				});

				m.exec(this);
			} else {
				this.last.ne();
			}
		}), cb);
	},
	sendMails: function (users, subject, text, cb, inReplyTo, messageID) {
		//todo: add inReplyTo and messageID!
		var mails;

		step(function () {
			users.forEach(function (user) {
				user.getEMail(viewCreator.logedinViewStub, this.parallel());
			}, this);
		}, h.sF(function (theMails) {
			mails = theMails;

			users.forEach(function (user, i) {
				client.hget("mail:" + user.getID(), mails[i] + ":verified", this.parallel());
			}, this);
		}), h.sF(function (verified) {
			//TODO: text replacements (e.g. user name!)
			users.forEach(function (user, i) {
				if (verified[i] === "1") {
					mail.sendMail({
						from: defaultFrom,
						to: mails[i],
						subject: subject.toString(),
						text: text.toString()
					});
				}
			});

			this.ne();
		}), cb);
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

module.exports = mailer;