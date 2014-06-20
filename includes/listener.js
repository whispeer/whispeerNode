"use strict";

var step = require("step");
var h = require("whispeerHelper");
var User = require("./user");

var listener = {
	"friends:online": function fo(view, data) {
		data = JSON.parse(data);
		view.socket.emit("friendOnlineChange", {
			uid: data.sender,
			status: data.content
		});
	},
	friendRequest: function fr(view, uid) {
		step(function () {
			//we definitly need to add this users friendKey here!
			//maybe also get this users profile.
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(view, this);
		}), function (e, data) {
			if (!e) {
				view.socket.emit("friendRequest", {
					uid: uid,
					user: data
				});
			} else {
				console.error(e);
			}
		});
	},
	friendAccept: function fa(view, uid) {
		step(function () {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(view, this);
		}), function (e, data) {
			if (!e) {
				view.socket.emit("friendAccept", {
					uid: uid,
					user: data
				});
			} else {
				console.error(e);
			}
		});
	},
	message: function messageLF(view, messageid) {
		var Message = require("./messages.js");
		var m, mData, theTopic;
		step(function messageLF1() {
			m = new Message(messageid);

			this.parallel.unflatten();

			m.getFullData(view, this.parallel(), true);
			m.getTopic(this.parallel());
		}, h.sF(function (data, topic) {
			theTopic = topic;
			mData = data;

			theTopic.messageCount(view, this);
		}), h.sF(function (count) {
			if (count === 1) {
				theTopic.getFullData(view, this, true, false);
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
				view.socket.emit("message", data);
			} else {
				console.error(e);
			}
		});
	}
};

module.exports = listener;