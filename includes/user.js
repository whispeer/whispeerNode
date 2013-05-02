"use strict";

var step = require("step");
var redis = require("redis");
var h = require("./helper");

function isMail(mail) {

}

function isNickName(nickname) {

}

var User = function (id) {

};

User.getUser = function (identifier, callback) {
	var theClient;
	step(function () {
		theClient = redis.createClient();

		if (h.isMail(identifier)) {
			theClient.get("user:mail:" + identifier, this);
		} else if (h.isNickname(identifier)) {
			theClient.get("user:nickname:" + identifier, this);
		} else if (h.isID(identifier)) {
			this.ne(parseInt(identifier, 10));
		} else {
			throw new UserNotExisting(identifier);
		}
	}, h.sF(function (id) {
		if (id) {
			return new User(id);
		} else {
			throw new UserNotExisting(identifier);
		}
	}));
};

module.exports = User;