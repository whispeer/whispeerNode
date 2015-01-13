"use strict";

var step = require("step");
var h = require("whispeerHelper");

var code = require("./session").code;
var client = require("./redisClient");
var mailer = require("./mailer");

var INVITELENGTH = 10;
var REQUESTLENGTH = 30;

var ALWAYSVALIDCODE = "whispeerfj";

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
			if (name) {
				name = name.replace(/[^\w\s]/);
			} else {
				name = false;
			}

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
				}, this.parallel());
			}, this);
		}), cb);
	},
	addRequestMail: function (mail, cb) {
		var requestCode;
		step(function () {
			code(REQUESTLENGTH, this);
		}, h.sF(function (_requestCode) {
			requestCode = _requestCode;
			client.sadd("invites:requests", requestCode, this);
		}), h.sF(function (added) {
			if (added) {
				client.set("invites:requests:" + requestCode, mail, this);
			} else {
				invites.addRequestMail(mail, this);
			}
		}), h.sF(function () {
			mailer.mailAdmin("New Register Request", "Code: " + requestCode + "\nMail: " + mail, this);
		}), cb);
	},
	acceptRequest: function (request, code, cb) {
		step(function () {
			client.get("invites:requests:" + code, this);
		}, h.sF(function (mail) {
			if (mail) {
				invites.byMail(request, [mail], false, this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function () {
			client.multi().srem("invites:requests", code).del("invites:requests:" + code).exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	},
	useCode: function (inviteCode, cb) {
		step(function () {
			if (inviteCode === ALWAYSVALIDCODE) {
				this.last.ne(true);
				return;
			}

			//remove code from not used list
			client.srem("invites:unused", inviteCode, this);
		}, h.sF(function (removedCount) {
			this.ne(removedCount === 1);
		}), cb);
	},
	checkCode: function (inviteCode, cb) {
		if (inviteCode === ALWAYSVALIDCODE) {
			cb(null, true);
		} else {
			client.sismember("invites:unused", inviteCode, cb);
		}
	}
};

module.exports = invites;