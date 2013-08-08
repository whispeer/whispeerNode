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
			read: (bool)
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
	this.getID = function getIDF() {
		return id;
	};

	this.getSenderID = function getSenderIDF(cb) {
		step(function () {
			client.hget(domain + ":meta", "sender", this);
		}, h.sF(function (senderid) {
			this.ne(senderid);
		}), cb);
	};

	this.getSender = function getSenderF(cb) {
		step(function () {
			theMessage.getSender(this);
		}, h.sF(function (senderid) {
			var User = require("./user");
			User.get(senderid, this);
		}), cb);
	};

	this.getReceiver = function getReceiverF(cb) {
		step(function () {
			theMessage.getTopic(this);
		}, h.sF(function (topic) {
			topic.getReceiver(this);
		}), cb);
	};

	this.getTopic = function getTopicF(cb) {
		step(function () {
			client.hget(domain + ":meta", "topicid", this);
		}, h.sF(function (topicid) {
			Topic.get(topicid);
		}), cb);
	};

	this.hasTopic = function hasTopicF(cb) {

	};

	this.getMeta = function getMetaF(cb) {
		step(function () {
			client.hgetall(domain + ":meta", this);
		}, h.sF(function (data) {
			this.ne(data);
		}), cb);
	};

	this.getContent = function getContentF(cb) {
		step(function () {
			client.hgetall(domain + ":content", this);
		}, h.sF(function (data) {
			this.ne(data);
		}), cb);
	};
};

Message.create = function (view, data, cb) {
	var theTopic, theMessageID;

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
		//TODO: check meta signature

		data.content.key = key.getRealID();
		client.incr("message:messages", this);
	}), h.sF(function (messageid) {
		data.meta.sender = view.getUserID();
		data.meta.messageid = messageid;
		theMessageID = messageid;
		client.hmset("message:" + messageid + ":meta", data.meta, this.parallel());
		client.hmset("message:" + messageid + ":content", data.content, this.parallel());
	}), h.sF(function () {
		var theMessage = new Message(theMessageID);
		theTopic.addMessage(theMessage);
	}), cb);
};