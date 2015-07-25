"use strict";

var client = require("./redisClient");

var Bluebird = require("bluebird");

var Notification = function (id) {
	this._id = id;
};

Notification.prototype.hasAccess = function (userid) {
	return client.sismemberAsync("notifications:user:" + userid + ":all", this._id);
};

Notification.prototype.getNotificationData = function (request) {
	var ownUserID = request.session.getUserID();

	return Bluebird.all([
		client.hgetallAsync("notifications:byID:" + this._id),
		this.hasAccess(ownUserID),
		this.isUnread(ownUserID)
	]).spread(function (notificationData, hasAccess, unread) {
		notificationData.receivers = JSON.parse(notificationData.receivers);
		notificationData.unread = unread;

		return notificationData;
	});
};

Notification.prototype.isUnread = function (userid) {
	return client.sismemberAsync("notifications:user:" + userid + ":unread");
};

Notification.prototype.getID = function () {
	return this._id;
};

Notification.prototype.markRead = function (request) {
	return client.sremAsync("notifications:user:" + request.session.getUserID() + ":unread", this._id);
};

Notification.getOwnUnreadCount = function (request) {
	return client.scardAsync("notifications:user:" + request.session.getUserID() + ":unread");
};

Notification.getOwn = function (request, start, count) {
	var ownUserID = request.session.getUserID();

	return client.zrangeAsync("notifications:user:" +  ownUserID + ":sorted", start, start + count - 1);
};

Notification.add = function (users, type, subType, referenceID, options) {
	return client.incrAsync("notifications:count").then(function (notificationID) {
		var userIDs = users.map(function (user) {
			return user.getID();
		});

		var multi = client.multi();
		multi.hmset("notifications:byID:" + notificationID, {
			id: notificationID,
			type: type,
			subType: subType,
			referenceID: referenceID,
			time: new Date().getTime(),
			receivers: JSON.stringify(userIDs)
		});

		userIDs.forEach(function (userid) {
			multi.zadd("notifications:user:" + userid + ":sorted", notificationID, new Date().getTime());
			multi.sadd("notifications:user:" + userid + ":all", notificationID);
			multi.sadd("notifications:user:" + userid + ":type:" + type, notificationID);
			multi.sadd("notifications:user:" + userid + ":unread", notificationID);
		});

		var exec = Bluebird.promisify(multi.exec, multi);
		var mailer = require("./mailer");

		return Promise.all([
			exec(),
			mailer.sendInteractionMails(users, type, subType, referenceID, options)
		]).then(function () {
			return notificationID;
		});
	});
};

module.exports = Notification;
