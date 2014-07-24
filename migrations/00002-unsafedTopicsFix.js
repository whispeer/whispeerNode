"use strict";

var step = require("step");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function getMessageData(mid, cb) {
	step(function () {
		this.parallel.unflatten();

		client.hget("message:" + mid + ":meta", "sender", this.parallel());
		client.hget("message:" + mid + ":meta", "sendTime", this.parallel());
	}, h.sF(function (sender, time) {
		this.ne({
			mid: mid,
			sender: sender,
			time: time
		});
	}), cb);
}

function getTopicData(tid, cb) {
	var result;

	step(function () {
		this.parallel.unflatten();

		client.smembers("topic:" + tid + ":receiver", this.parallel());
		client.zrange("topic:" + tid + ":user:[object Object]:unread", "0", "-1", this.parallel());
	}, h.sF(function (receiverids, unreadMessages) {
		result = {
			receiverids: receiverids,
			tid: tid
		};

		unreadMessages.forEach(function (message) {
			getMessageData(message, this.parallel());
		}, this);
	}), h.sF(function (unreadMessages) {
		result.unreadMessages = unreadMessages;

		this.ne(result);
	}), cb);
}

function fixUnsavedTopics(cb) {
	var multi = client.multi();

	var topics = [], scores = {};
	step(function () {
		client.zrange("topic:user:[object Object]:topics", "0", "-1", "WITHSCORES", this);
	}, h.sF(function (data) {
		var i;
		for (i = 0; i < data.length; i += 2) {
			topics.push(data[i]);
			scores[data[i]] = data[i + 1];
		}

		topics.forEach(function (tid) {
			getTopicData(tid, this.parallel());
		}, this);

		if (topics.length === 0) {
			this.ne([]);
		}
	}), h.sF(function (topicData) {
		topicData.forEach(function (tdata) {
			var tid = tdata.tid;
			tdata.receiverids.forEach(function (rid) {
				multi.zadd("topic:user:" + rid + ":topics", scores[tid], tid);
			});
			tdata.unreadMessages.forEach(function (unReadMessage) {
				tdata.receiverids.forEach(function (rid) {
					if (rid !== unReadMessage.sender) {
						multi.zadd("topic:" + tid + ":user:" + rid + ":unread", unReadMessage.time, unReadMessage.mid);
						multi.zadd("topic:user:" + rid + ":unreadTopics", scores[tid], tid);
					}
				});
			});
		});

		multi.exec(this);
	}), h.sF(function () {
		this.ne(true);
	}), cb);
}

module.exports = fixUnsavedTopics;