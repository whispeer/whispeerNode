#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var invites = require("../includes/invites");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var setupP = Bluebird.promisify(setup);
var smembers = Bluebird.promisify(client.smembers, client);

var hgetall = Bluebird.promisify(client.hgetall, client);
var scard = Bluebird.promisify(client.scard, client);

var byMail = Bluebird.promisify(invites.byMail, invites);

setupP().then(function () {
	return smembers("invites:v2:all");
}).map(function (inviteCode) {
	return hgetall("invites:v2:code:" + inviteCode).then(function (data) {
		data.code = inviteCode;
		return data;
	});
}).then(function (invites) {
	return invites.filter(function (invite) {
		return invite.reference.indexOf("@") > -1;
	});
}).map(function (invite) {
	return scard("invites:v2:code:" + invite.code + ":used").then(function (card) {
		invite.accepted = card;
		return invite;
	});
}).then(function (invites) {
	var noDuplicateMailInvites = [], seenMails = {};

	invites.forEach(function (invite) {
		if (seenMails[invite.reference]) {
			if (seenMails[invite.reference].accepted === 0) {
				seenMails[invite.reference] = invite;
			}
		} else {
			seenMails[invite.reference] = invite;
		}
	});

	h.objectEach(seenMails, function (mail, invite) {
		noDuplicateMailInvites.push(invite);
	});

	return noDuplicateMailInvites;
}).filter(function (invite) {
	return invite.accepted === 0;
}).each(function (invite) {
	var requestStub = {
		session: {
			logedinError: function (cb) { cb(); },
			getUserID: function () { return h.parseDecimal(invite.user); }
		}
	};

	console.log(invite.reference);

	return byMail(requestStub, [invite.reference], false, "de");
}).delay(10000).then(function () {
	process.exit();
});
