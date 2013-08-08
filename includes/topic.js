"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

/*
	topic: {
		//thinking: we need multiple ones here right?
		key: key,
		receiver: [(int)],
		creator: (int),
		newest (int),
		unread: (bool)
	}

*/

var Topic = function (id) {
	var theTopic = this;
	var domain = "topic:" + id;
	this.getID = function getIDF() {
		return id;
	};

	function hasAccessError(view, cb) {
		step(function () {
			theTopic.hasAccess(view, this);
		}, h.sF(function (access) {
			if (access !== true) {
				throw new AccessViolation();
			}
		}), cb);
	}

	this.hasAccess = function hasAccessF(view, cb) {
		step(function () {
			client.sismember(view.getUserID(), this);
		}, h.sF(function (member) {
			this.ne(member === 1);
		}), cb);
	};

	this.getReceiverIDs = function getReceiverIDsF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.smembers(domain + ":receiver", this);
		}), cb);
	};

	this.getReceiver = function getReceiverF(view, cb) {
		step(function () {
			theTopic.getReceiverIDs(view, this);
		}, h.sF(function(receivers) {
			var User = require("./user");

			var i;
			for (i = 0; i < receivers.length; i += 1) {
				User.get(receivers[i], this.parallel());
			}
		}), cb);
	};

	this.getReceiverData = function getReceiverDataF(view, cb) {
		step(function () {
			theTopic.getReceiver(view, this);
		}, h.sF(function (receivers) {
			var i;
			for (i = 0; i < receivers; i += 1) {
				receivers[i].getUData(view, this);
			}
		}), cb);
	};

	this.getKey = function getKeyF(view, cb) {
		var Key = require("./crypto/Key");
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hget(domain + ":data", "key", this);
		}), h.sF(function (realid) {
			Key.get(realid, this);
		}), cb);
	};

	this.getFullData = function getFullDataF(view, cb, key, receivers) {
		var Key = require("./crypto/Key");
		var result;
		step(function () {
			theTopic.getTData(this);
		}, h.sF(function (data) {
			result = data;
			if (key) {
				Key.getWData(view, data.key, this, true);
			} else {
				this.ne(data.key);
			}
		}), h.sF(function (keyData) {
			result.key = keyData;

			if (receivers) {
				theTopic.getReceiverData(view, this);
			} else {
				theTopic.getReceiverIDs(view, this);
			}
		}), h.sF(function (receiver) {
			result.receiver = receiver;
			//TODO: add newest message

			this.ne(result);
		}), cb);
	};

	this.isLastOwn = function isLastOwnF(view, messageid, cb) {
		//TODO
	};

	this.addMessage = function addMessageF(view, message, cb) {
		//TODO
	};

	this.getMessages = function getMessagesF(view, cb) {
		//TODO
	};

	this.getTData = function getTDataF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hgetall(domain + ":data", this);
		}), cb);
	};
};

Topic.create = function (view, data, cb) {
	var SymKey = require("./crypto/symKey");
	var User = require("./user.js");

	var receiver, result, theTopicID;
	step(function () {
		var err = validator.validate("topic", data);

		if (err) {
			throw new InvalidTopicData();
		}

		if (data.cryptKeys.length !== data.receiver.length - 1) {
			throw new InvalidTopicData();
		}

		var i;
		for (i = 0; i < data.receiver.length; i += 1) {
			User.getUser(data.receiver[i], this);
		}
	}, h.sF(function () {
		var i;
		for (i = 0; i < data.cryptKeys.length; i += 1) {
			SymKey.createWDecryptors(view, data.cryptKeys[i], this.parallel());
		}
	}), h.sF(function () {
		SymKey.createWDecryptors(view, data.key, this);
	}), h.sF(function (key) {
		result.key = key.getRealID();
		receiver = data.receiver;

		//TODO: check all receiver have access!

		result.creator = view.getUserID();

		result.newest = 0;
		result.unread = false;

		client.incr("topic:topics", this);
	}), h.sF(function (topicid) {
		theTopicID = topicid;
		result.topicid = topicid;

		client.hset("topic:" + topicid + ":data", result, this.parallel());
		client.sadd("topic:" + topicid + ":receiver", receiver, this.parallel());
	}), h.sF(function () {
		this.ne(new Topic(theTopicID));
	}), cb);
};