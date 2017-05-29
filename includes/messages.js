"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

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

var Message = function (id) {
	var topic
	var theMessage = this;
	var domain = "message:" + id;

	/** the messages id */
	this.getID = function getIDF() {
		return id;
	};

	function hasAccessError(request) {
		return theMessage.hasAccess(request).then(function (access) {
			if (access !== true) {
				throw new AccessViolation("message");
			}
		})
	}

	/** does the current user have access */
	this.hasAccess = function (request, cb) {
		return theMessage.getTopic().then((theTopic) => {
			return theTopic.hasAccess(request);
		}).nodeify(cb)
	};

	/** message send time */
	this.getTime = function (request, cb) {
		return client.hgetAsync(domain + ":meta", "sendTime").nodeify(cb);
	};

	this.getSortCounter = function (request, cb) {
		return hasAccessError(request).then(() => {
			return client.hgetAsync(domain + ":meta", "_sortCounter");
		}).nodeify(cb)
	};

	/** sender id */
	this.getSenderID = function getSenderIDF(request, cb) {
		step(function () {
			return hasAccessError(request);
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
			return theMessage.getTopic();
		}, h.sF(function (topic) {
			topic.getReceiver(request, this);
		}), cb);
	};

	/** this message topic id */
	this.getTopicID = function getTopicIDF(cb) {
		return client.hgetAsync(domain + ":meta", "topicid").nodeify(cb);
	};

	/** this message topic object */
	this.getTopic = function getTopicF(cb) {
		if (topic) {
			return Bluebird.resolve(topic).nodeify(cb)
		}

		return theMessage.getTopicID().then((topicid) => {
			return Topic.get(topicid);
		}).then(function (theTopic) {
			topic = theTopic;
			return topic
		}).nodeify(cb)
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
	this.getMeta = function (request) {
		return hasAccessError(request).then(() => {
			return client.hgetallAsync(domain + ":meta")
		}).then((data) => {
			data.createTime = h.parseDecimal(data.createTime);
			data.sender = h.parseDecimal(data.sender);
			data.topicid = h.parseDecimal(data.topicid);

			if (data._sortCounter) {
				data._sortCounter = h.parseDecimal(data._sortCounter);
			}

			if (data.images) {
				data.images = JSON.parse(data.images);
			}

			return data
		})
	};

	/** get message content */
	this.getContent = function (request) {
		return hasAccessError(request).then(() => {
			return client.hgetallAsync(domain + ":content");
		})
	};

	/** get the full data of this message */
	this.getFullData = function (request, cb) {
		return hasAccessError(request).then(function () {
			return Bluebird.all([
				theMessage.getMeta(request),
				theMessage.getContent(request),
			])
		}).spread(function (meta, content) {
			const result = {
				meta: meta,
				content: content
			};

			return Bluebird.fromCallback((cb) => {
				request.addKey(result.meta._key, cb);
			}).thenReturn(result)
		}).nodeify(cb);
	};
};

function processImages(request, images, keys) {
	return Bluebird.resolve(keys).map((key) => {
		return SymKey.create(request, key)
	})
}

Message.create = function (request, data, cb) {
	var theTopic, theMessageID, theMessage;
	var meta = data.meta;
	var server = {};

	step(function () {
		var err = validator.validate("message", data);

		if (err) {
			throw new InvalidMessageData();
		}

		if (!data.meta.topicid) {
			throw new InvalidMessageData();
		}

		return Topic.get(data.meta.topicid);
	}, h.sF(function (topic) {
		theTopic = topic;

		this.parallel.unflatten()

		return Bluebird.all([
			theTopic.getNewest(request),
			theTopic.getSuccessorID(),
		])
	}), h.sF(function ([newest, successor]) {
		if (successor && !meta.hidden) {
			throw new SuccessorError("Can't send message because topic has a successor")
		}

		if (newest === 0) {
			this.ne(0);
		} else {
			return newest.getSortCounter(request);
		}
	}), h.sF(function (newestCounter) {
		if (newestCounter && parseInt(meta._sortCounter, 10) < newestCounter) {
			console.warn("invalid counter");
			this.last.ne({ success: false });
			return;
		}

		if (data.meta.images && data.meta.images.length > 0) {
			return processImages(request, data.meta.images, data.imageKeys);
		} else {
			this.ne();
		}
	}), h.sF(function () {
		if (h.isUUID(data.meta.messageUUID)) {
			return client.getAsync("message:uuid:" + data.meta.messageUUID);
		} else {
			this.ne(false);
		}
	}), h.sF(function (uuidMessage) {
		if (uuidMessage) {
			this.last.ne({ success: true });
			return;
		}

		//TODOS: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)
		client.incr("message:messages", this);
	}), h.sF(function (messageid) {
		server = {
			sender: request.session.getUserID(),
			sendTime: new Date().getTime(),
			messageid: messageid
		};

		if (data.meta.images) {
			data.meta.images = JSON.stringify(data.meta.images);
		}

		data.meta = h.extend(data.meta, server, 1);

		theMessageID = messageid;
		var multi = client.multi();
		multi.hmset("message:" + messageid + ":meta", data.meta, this.parallel());
		multi.hmset("message:" + messageid + ":content", data.content, this.parallel());

		if (h.isUUID(data.meta.messageUUID)) {
			multi.set("message:uuid:" + data.meta.messageUUID, messageid);
		}

		multi.exec(this);
	}), h.sF(function () {
		theMessage = new Message(theMessageID);

		if (data.meta.hidden) {
			this.ne()
		} else {
			theTopic.addMessage(request, theMessage, this)
		}
	}), h.sF(function (success) {
		this.ne({ success, server });
	}), cb);
};

module.exports = Message;
