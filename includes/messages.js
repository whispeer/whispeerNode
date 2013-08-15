"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

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

	function hasAccessError(view, cb) {
		step(function () {
			theMessage.hasAccess(view, this);
		}, h.sF(function (access) {
			if (access !== true) {
				throw new AccessViolation();
			}

			this.ne();
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

	/** message send time */
	this.getTime = function getTimeF(view, cb) {
		step(function () {
			client.hget(domain + ":meta", "sendTime", this);
		}, cb);
	};

	this.getHash = function getHashF(view, cb) {
		step(function () {
			hasAccessError(view, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "ownHash", this);
		}), h.sF(function (hash) {
			this.ne(hash);
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
	this.getReceiver = function getReceiverF(view, cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (topic) {
			topic.getReceiver(view, this);
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
			hasAccessError(view, this);
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

		theTopic.getNewest(view, this);
	}), h.sF(function (newest) {
		if (newest === 0) {
			this.ne("0", 0);
		} else {
			this.parallel.unflatten();
			newest.getHash(view, this.parallel());
			this.parallel()(null, newest.getID());
			//TODO get newest hash!
		}
	}), h.sF(function (newestHash, newestID) {
		if (parseInt(meta.previousMessage, 10) !== parseInt(newestID, 10) || meta.previousMessageHash !== newestHash) {
			throw new InvalidMessageData();
		}

		var toHash = {
			meta: {
				createTime: meta.createTime,
				topicHash: meta.topicHash,
				previousMessage: meta.previousMessage,
				previousMessageHash: meta.previousMessageHash
			},
			content: {
				iv: data.content.iv,
				text: data.content.text
			}
		};

		var chelper = require("./crypto/cHelper");
		if (chelper.hash.hashObject(toHash) !== meta.ownHash) {
			throw new InvalidMessageData("Invalid Hash");
		}

		toHash.meta.ownHash = meta.ownHash;

		//TODO: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)

		var SymKey = require("./crypto/symKey");
		SymKey.createWDecryptors(view, data.content.key, this);
	}), h.sF(function (key) {
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