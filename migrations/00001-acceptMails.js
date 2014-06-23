"use strict";
//get all users

//filter for those which have a mail

//send accept mail to those users

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

var User = require("../includes/user");
var mailer = require("../includes/mailer");

var userids;

function sendAcceptMails(cb) {
	step(function () {
		client.smembers("user:list", this);
	}, h.sF(function (_userids) {
		userids = _userids;

		userids.forEach(function (userid) {
			client.get("user:" + userid + ":email", this.parallel());
		}, this);
	}), h.sF(function (mails) {
		mails.forEach(function (mail, i) {
			if (mail) {
				mailer.sendAcceptMail(new User(userids[i]), this.parallel());
			} else {
				this.parallel()();
			}
		}, this);
	}), h.sF(function () {
		this.ne(true);
	}), cb);
}

module.exports = sendAcceptMails;