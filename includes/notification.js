"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");

/*
	signature is of meta without signature.

	indizes for:
	- wall
	- posterid

	notification: {
		user: userid
		theme: ["wallpost", "comment", "like/whatever"]
		referenceid: {number}
	}

	

*/

var Notification = function (view, id) {
	this._userid = view.getUserID();
	this._id = id;
};

Notification.prototype.getNData = function () {
	var that = this;
	step(function () {
		client.hgetall("user:" + that._userid + ":notifications:" + that._id, this);
	}, this);
};

Notification.prototype.getUserID = function () {
	return this._userid;
};

Notification.prototype.getID = function () {
	return this._id;
};

Notification.prototype.getUniqueID = function () {
	return this._userid + ":" + this._id;
};

Notification.prototype.getTheme = function (cb) {
	var that = this;
	step(function () {
		client.get("user:" + that._userid + ":notifications:" + that._id, this);
	}, cb);
};

Notification.getOwnUnreadCount = function (view) {

};

Notification.getOwn = function (view) {

};

Notification.add = function (userid, theme, referenceid, cb) {
	var theID;
	step(function () {
		client.incr("user:" + userid + ":notifications", this);
	}, h.sF(function (newid) {
		theID = newid;
		multi.hmset("user:" + userid + ":notifications:" + newid, {
			id: newid,
			theme: theme,
			referenceid: referenceid,
			unread: true
		});
		multi.sadd("user:" + userid + ":notifications:all", newid);
		multi.sadd("user:" + userid + ":notifications:unread", newid);
	}), h.sF(function () {
		this.ne(theID);
	}), cb);
};

module.exports = Notification;