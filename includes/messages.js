"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Bluebird = require("bluebird");

var validator = require("whispeerValidations");

var SymKey = require("./crypto/symKey");

var Message = function () {};

function processImages(request, images, keys) {
	return Bluebird.resolve(keys).map((key) => {
		return SymKey.create(request, key)
	})
}

Message.create = function (request, data, cb) {
	var theTopic
	var meta = data.meta;

	step(function () {
		var err = validator.validate("message", data);

		if (err) {
			throw new InvalidMessageData();
		}

		if (!data.meta.topicid) {
			throw new InvalidMessageData();
		}
	}, h.sF(function () {
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
		//TODOS: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)
	}), cb);
};

module.exports = Message;
