"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var User = require("./user");

var SymKey = require("./crypto/symKey");

/*
	message: {
		meta: {
			createTime: (int),
			_parent: (hex)
			_sortCounter
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
				throw new AccessViolation("message");
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

	this.getSortCounter = function (request, cb) {
		step(function () {
			hasAccessError(request, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "_sortCounter", this);
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
			data.createTime = h.parseDecimal(data.createTime);
			data.sender = h.parseDecimal(data.sender);
			data.topicid = h.parseDecimal(data.topicid);

			if (data._sortCounter) {
				data._sortCounter = h.parseDecimal(data._sortCounter);
			}

			if (data.images) {
				data.images = JSON.parse(data.images);
			}

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
	this.getFullData = function getFullDataF(request, cb) {
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

			request.addKey(result.meta._key, this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	};
};

function processImages(request, images, keys, cb) {
	step(function () {
		keys.forEach(function (key) {
			SymKey.createWDecryptors(request, key, this.parallel());
		}, this);
	}, cb);
}

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
			this.ne(0);
		} else {
			this.parallel.unflatten();
			newest.getSortCounter(request, this);
		}
	}), h.sF(function (newestCounter) {
		if (newestCounter && parseInt(meta._sortCounter, 10) < newestCounter) {
			console.warn("invalid counter");
			this.last.ne(false);
			return;
		}

		if (data.meta.images && data.meta.images.length > 0) {
			processImages(request, data.meta.images, data.imageKeys, this);
		} else {
			this.ne();
		}
	}), h.sF(function () {
		//TODOS: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)
		client.incr("message:messages", this);
	}), h.sF(function (messageid) {
		if (data.meta.images) {
			data.meta.images = JSON.stringify(data.meta.images);
		}

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
