"use strict";

var Topic = require("./topic");
var step = require("step");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var validator = require("whispeerValidations");
var client = require("./redisClient");

var SymKey = require("./crypto/symKey");

var Message = function () {};

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
		return client.incrAsync("message:messages");
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

		return Bluebird.fromCallback((cb) => multi.exec(cb))
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
