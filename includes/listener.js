"use strict";

var step = require("step");
var h = require("whispeerHelper");

var listener = {
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
				view.getSocket().emit("message", data);
			} else {
				console.error(e);
			}
		});
	}
};

module.exports = listener;