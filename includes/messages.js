"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");

var User = require("./user");

/*
	message: {
		meta: {
			createTime: (int),
			topicHash: (hex)
			previousMessage: (int),
			previousMessageHash: (hex),
			ownHash: (hex)
			sender: (int),
			topicid: (int),
			read: (bool)
			signature: (hex)
			encrSignature: (hex)
		}
		content: {
			key,
			iv: (hex),
			text: (hex)
		}
	}
*/

var Message = function (id, topic) {
	var theMessage = this;
	var domain = "message:" + id;

	/** the messages id */
	this.getID = function getIDF() {
		return id;
	};

	function hasAccessError(request, cb) {
		step(function () {
			theMessage.hasAccess(request, this);
		}, h.sF(function (access) {
			if (access !== true) {
				throw new AccessViolation();
			}

			this.ne();
		}), cb);
	}

	/** does the current user have access */
	this.hasAccess = function hasAccessF(request, cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (theTopic) {
			theTopic.hasAccess(request, this);
		}), cb);
	};

	/** message send time */
	this.getTime = function getTimeF(request, cb) {
		step(function () {
			client.hget(domain + ":meta", "sendTime", this);
		}, cb);
	};

	this.getHash = function getHashF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "_ownHash", this);
		}), h.sF(function (hash) {
			this.ne(hash);
		}), cb);
	};

	/** sender id */
	this.getSenderID = function getSenderIDF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "sender", this);
		}), h.sF(function (senderid) {
			this.ne(senderid);
		}), cb);
	};

	/** sender object */
	this.getSender = function getSenderF(request, cb) {
		step(function () {
			theMessage.getSenderID(request, this);
		}, h.sF(function (senderid) {
			User.get(senderid, this);
		}), cb);
	};

	/** who will receive this message */
	this.getReceiver = function getReceiverF(request, cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (topic) {
			topic.getReceiver(request, this);
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
			if (topic) {
				this.last.ne(topic);
			} else {
				theMessage.getTopicID(this);
			}
		}, h.sF(function (topicid) {
			Topic.get(topicid, this);
		}), h.sF(function (theTopic) {
			topic = theTopic;
			this.ne(topic);
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
	this.getMeta = function getMetaF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.hgetall(domain + ":meta", this);
		}), h.sF(function (data) {
			data.createTime = parseInt(data.createTime, 10);
			data.previousMessage = parseInt(data.previousMessage, 10);
			data.sender = parseInt(data.sender, 10);
			data.topicid = parseInt(data.topicid, 10);

			this.ne(data);
		}), cb);
	};

	/** get message content */
	this.getContent = function getContentF(request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.hgetall(domain + ":content", this);
		}), h.sF(function (data) {
			this.ne(data);
		}), cb);
	};

	/** get the full data of this message */
	this.getFullData = function getFullDataF(request, cb, key) {
		var result;
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			theMessage.getMeta(request, this.parallel());
			theMessage.getContent(request, this.parallel());
		}), h.sF(function (meta, content) {
			result = {
				meta: meta,
				content: content
			};

			if (key) {
				KeyApi.getWData(request, result.meta._key, this, true);
			} else {
				this.ne(result.meta._key);
			}
		}), h.sF(function (key) {
			request.addKeyData(key);
			this.ne(result);
		}), cb);
	};
};

Message.create = function (request, data, cb) {
	var theTopic, theMessageID, theMessage;
	var meta = data.meta;

	step(function () {
		var err = validator.validate("message", data);

		if (err) {
			throw new InvalidMessageData();
		}

		if (data.meta.topicid) {
			this.parallel.unflatten();

			Topic.get(data.meta.topicid, this.parallel());
		} else {
			throw new InvalidMessageData();
		}
	}, h.sF(function (topic) {
		theTopic = topic;

		theTopic.getNewest(request, this);
	}), h.sF(function (newest) {
		if (newest === 0) {
			this.ne("0", 0);
		} else {
			this.parallel.unflatten();
			newest.getHash(request, this.parallel());
			this.parallel()(null, newest.getID());
		}
	}), h.sF(function (newestHash, newestID) {
		if (parseInt(meta.previousMessage, 10) !== parseInt(newestID, 10) || meta.previousMessageHash !== newestHash) {
			this.last.ne(false);
			return;
		}

		//TODOS: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)
		client.incr("message:messages", this);
	}), h.sF(function (messageid) {
		data.meta.sender = request.session.getUserID();
		data.meta.sendTime = new Date().getTime();
		data.meta.messageid = messageid;
		theMessageID = messageid;
		client.hmset("message:" + messageid + ":meta", data.meta, this.parallel());
		client.hmset("message:" + messageid + ":content", data.content, this.parallel());
	}), h.sF(function () {
		theMessage = new Message(theMessageID);
		theTopic.addMessage(request, theMessage, this);
	}), cb);
};

module.exports = Message;