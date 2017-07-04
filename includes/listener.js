"use strict";

var step = require("step");
var h = require("whispeerHelper");
var User = require("./user");

var RequestData = require("./requestData");

var errorService = require("./errorService");

var listener = {
	"friends:online": function (socketData, data) {
		socketData.socket.emit("friendOnlineChange", {
			keys: [],
			uid: data.sender,
			status: data.content
		});
	},
	signatureCache: function () {},
	friendRequest: function (socketData, uid) {
		var request = new RequestData(socketData, {});
		step(function () {
			//we definitly need to add this users friendKey here!
			//maybe also get this users profile.
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(request, this);
		}), function (e, data) {
			if (!e) {
				socketData.socket.emit("friendRequest", {
					keys: request.getAllKeys(),
					uid: uid,
					user: data
				});
			} else {
				errorService.handleError(e, request);
			}
		});
	},
	friendAccept: function (socketData, uid) {
		var request = new RequestData(socketData, {});

		step(function () {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(request, this);
		}), function (e, data) {
			if (!e) {
				socketData.socket.emit("friendAccept", {
					keys: request.getAllKeys(),
					uid: uid,
					user: data
				});
			} else {
				errorService.handleError(e, request);
			}
		});
	},
	topicRead: function (socketData) {
		var Topic = require("./topic.js");
		var request = new RequestData(socketData, {});

		step(function () {
			Topic.unreadIDs(request, this);
		}, h.sF(function (ids) {
			socketData.socket.emit("unreadTopics", { unread: ids });
		}), function (e) {
			if (e) {
				errorService.handleError(e, request);
			}
		});
	},
	message: function (socketData, messageid) {
		var Message = require("./messages.js");
		var m, mData, theTopic;

		var request = new RequestData(socketData, {});

		step(function messageLF1() {
			m = new Message(messageid);

			this.parallel.unflatten();

			m.getFullData(request, this.parallel(), true);
			m.getTopic(this.parallel());
		}, h.sF(function (data, topic) {
			theTopic = topic;
			mData = data;

			theTopic.messageCount(request, this);
		}), h.sF(function (count) {
			if (count === 1) {
				theTopic.getFullData(request, this, true, false);
			} else {
				this.last.ne({
					message: mData
				});
			}
		}), h.sF(function (topicData) {
			this.last.ne({
				topic: topicData,
				message: mData
			});
		}), function (e, data) {
			if (!e) {
				data.keys = request.getAllKeys();
				socketData.socket.emit("message", data);
			} else {
				errorService.handleError(e, request);
			}
		});
	}
};

module.exports = listener;
