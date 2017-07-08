"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");

var Message = function () {};

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
		return theTopic.getNewest(request)
	}), h.sF(function (newest) {
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
	}), h.sF(function () {
		//TODOS: check overall signature
		//chelper.checkSignature(user.key, toHash, meta.encrSignature)
	}), cb);
};

module.exports = Message;
