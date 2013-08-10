"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

/*
	message: {
		meta: {
			previousOwn: (int),
			previousOther: (int),
			sender: (int),
			signature: (hex),
			topicid: (int),
			read: (bool),
			sendTime: (int)
		}
		content: {
			key,
			iv: (hex),
			text: (hex),
			signature: (hex)
		}

	}
*/

var Message = function (id) {
	var theMessage = this;
	var domain = "message:" + id;

	/** the messages id */
	this.getID = function getIDF() {
		return id;
	};

	function hasAccessError(view, cb) {
		step(function () {
			theMessage.hasAccess(view, this);
		}, h.sF(function (access) {
			if (access !== true) {
				throw new AccessViolation();
			}
		}), cb);
	}

	/** does the current user have access */
	this.hasAccess = function hasAccessF(view, cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (theTopic) {
			theTopic.hasAccess(view, this);
		}), cb);
	};

	/** sender id */
	this.getSenderID = function getSenderIDF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "sender", this);
		}), h.sF(function (senderid) {
			this.ne(senderid);
		}), cb);
	};

	/** sender object */
	this.getSender = function getSenderF(view, cb) {
		step(function () {
			theMessage.getSenderID(view, this);
		}, h.sF(function (senderid) {
			var User = require("./user");
			User.get(senderid, this);
		}), cb);
	};

	/** who will receive this message */
	this.getReceiver = function getReceiverF(cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (topic) {
			topic.getReceiver(this);
		}), cb);
	};

	/** this message topic id */
	this.getTopicID = function getTopicIDF(cb) {
		step(function () {
			client.hget(domain + ":meta", "topicid", this);
		}, cb);
	};

	/** this message topic object */
	this.getTopic = function getTopicF(cb) {
		step(function () {
			theMessage.getTopicID(this);
		}, h.sF(function (topicid) {
			Topic.get(topicid);
		}), cb);
	};

	/** is this message topic topicID?`*/
	this.hasTopic = function hasTopicF(topicID, cb) {
		step(function () {
			theMessage.getTopicID(this);
		}, h.sF(function (realTopicID) {
			this.ne(topicID === realTopicID);
		}), cb);
	};

	/** get message meta data */
	this.getMeta = function getMetaF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hgetall(domain + ":meta", this);
		}), h.sF(function (data) {
			this.ne(data);
		}), cb);
	};

	/** get message content */
	this.getContent = function getContentF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hgetall(domain + ":content", this);
		}), h.sF(function (data) {
			this.ne(data);
		}), cb);
	};

	/** get the full data of this message */
	this.getFullData = function getFullDataF(view, cb, key) {
		var result, Key = require("./crypto/Key");
		step(function () {
			hasAccessError(this);
		}, h.sF(function () {
			this.parallel.unflatten();
			theMessage.getMeta(view, this.parallel());
			theMessage.getContent(view, this.parallel());
		}), h.sF(function (meta, content) {
			result = {
				meta: meta,
				content: content
			};

			if (key) {
				Key.getWData(view, result.content.key, this, true);
			} else {
				this.ne(result.content.key);
			}
		}), h.sF(function (key) {
			result.content.key = key;

			this.ne(result);
		}), cb);
	};
};

Message.create = function (view, data, cb) {
	var theTopic, theMessageID, theMessage;

	step(function () {
		var err = validator.validate("message", data);
		if (err) {
			throw InvalidMessageData();
		}

		if (data.meta.topicid) {
			this.parallel.unflatten();

			Topic.get(data.meta.topicid, this.parallel());

			if (data.meta.previousOther !== 0) {
				Message.get(data.meta.previousOther, this.parallel());
			}
		} else {
			throw InvalidMessageData();
		}
	}, h.sF(function (topic, previousOther) {
		theTopic = topic;

		this.parallel.unflatten();

		topic.isLastOwn(view, data.meta.previousOwn, this.parallel());

		if (previousOther) {
			previousOther.hasTopic(topic, this.parallel());
		} else {
			this.parallel()(true);
		}
	}), h.sF(function (isLastOwn, validPreviousOther) {
		if (!isLastOwn || !validPreviousOther) {
			throw InvalidMessageData();
		}

		var SymKey = require("./crypto/symKey");
		SymKey.createWDecryptors(view, data.content.key, this);
	}), h.sF(function (key) {
		//TO-DO: check meta signature

		data.content.key = key.getRealID();
		client.incr("message:messages", this);
	}), h.sF(function (messageid) {
		data.meta.sender = view.getUserID();
		data.meta.sendTime = new Date().getTime();
		data.meta.messageid = messageid;
		theMessageID = messageid;
		client.hmset("message:" + messageid + ":meta", data.meta, this.parallel());
		client.hmset("message:" + messageid + ":content", data.content, this.parallel());
	}), h.sF(function () {
		theMessage = new Message(theMessageID);
		theTopic.addMessage(view, theMessage, this);
	}), cb);
};

module.exports = Message;