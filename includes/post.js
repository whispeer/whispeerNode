"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var Circle = require("./circle");
var User = require("./user");

/*
	post: {
		meta: {
			(key),
			(readers), //who can read this post?
			(receiver), //for a wallpost
			time
		}
		content,
		signature,
	}

*/

var Post = function (userid, id) {
	var domain = "user:" + userid + ":posts:" + id, thePost = this;
	this.getData = function getDataF(view, cb, key) {
	};

	this.throwUserAccess = function throwUserAccessF(view, cb) {
		//access is determined how?
		//maybe just key access?
	};

	this.getKey = function getKeyF(view, cb) {
		step(function () {
			thePost.throwUserAccess(view, this);
		}, h.sF(function () {
			client.hget(domain, "key", this);
		}), cb);
	};

	this.getContent = function getContentF(view, cb) {
		step(function () {
			thePost.throwUserAccess(view, this);
		}, h.sF(function () {
			client.hget(domain, "content", this);
		}), cb);
	};
};

Post.get = function (view, circleid, cb) {
};

Post.getTimeline = function (view, filter, cb) {
	//filter.user
	//filter.circle
	//filter.meta
		//allFriends
		//friendsOfFriends

	//get everyone I might be interested in also considering filter criteria
	var keys = [];

	if (!filter) {
		filter = {
			allFriends: true
		};
	}

	var interestingUsers = filter.users || [];
	var circles = filter.circles || [];

	var i;
	for (i = 0; i < circles.length; i += 1) {
		Circle.get(view, circles[i]);
	}

	for (i = 0; i < interestingUsers.length; i +=1 ) {
		keys.push("user:" + interestingUsers[i] + ":posts");
	}

	client.zinterstore.apply(keys);
};

Post.getUserWall = function (view, userid, cb) {
	client.zrevrank("user:" + userid + ":wall", cb);
};

Post.validateFormat = function (data) {
	if (!data.content) {
		throw new InvalidPost("content missing");
	}

	if (!data.key && data.readers || data.key && !data.readers) {
		throw new InvalidPost("readers and keys need each other");
	}

	//TODO: add those functions/rename
	if (data.key && KeyApi.InvalidKeyData(data.key)) {
		throw new InvalidPost("invalid key");
	}

	if (data.readers && !h.isNumberArray(data.readers)) {
		throw new InvalidPost("invalid readers");
	}
};

Post.create = function (view, data, cb) {
	var SymKey = require("./crypto/symKey");

	step(function () {
		Post.validateFormat(data);
	}, h.sF(function () {
		var id = 0;
		var readers = data.readers;
		if (!readers) {
			//set readers to all friends.
			//they will not need a key to decrypt this post
		}

		if (data.meta.key) {
			SymKey.createWDecryptors(view, data.meta.key);
		}

		var multi = client.multi();
		multi.zadd("user:" + view.getUserID() + ":posts", data.time, id);
		multi.zadd("user:" + data.receiver + ":wall", data.time, id);

		multi.hmset("post:" + id + ":meta", data.meta);
	}), cb);
};

module.exports = Post;