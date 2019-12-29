"use strict";

const Notification = {};

Notification.add = function (users, type, subType, referenceID, options) {
	const mailer = require("./mailer");

	return mailer.sendInteractionMails(users, type, subType, {interactionID: referenceID}, options)
};

module.exports = Notification;
