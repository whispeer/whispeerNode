"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var Friends = require("./friends");

/*
	signature is of meta without signature.

	indizes for:
	- wall
	- posterid

	post: {
		meta: {
			contentHash,
			time,
			signature,
			(key),
			(readers), //who can read this post?
			(receiver), //for a wallpost
		}
		content //padded!
	}

	

*/

var Post = function (postid) {
	var domain = "posts:" + postid, thePost = this;
	this.getPostData = function getDataF(view, cb, key) {
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

function getUserIDsFromUserFilter(filter, cb) {
	step(function () {
		if (filter.length > 0) {
			var i;
			for (i = 0; i < filter.length; i += 1) {
				User.getUser(filter[i], this.parallel(), true);
			}
		} else {
			this.last.ne([]);
		}
	}, h.sF(function (users) {
		var i, userids = [];
		for (i = 0; i < users.length; i += 1) {
			if (!(users[i] instanceof UserNotExisting)) {
				userids.push(users[i].getID());
			}
		}

		this.ne(userids);
	}), cb);
}

function removeDoubleFilter(filter) {
	var currentFilter, currentFilterOrder = 0;
	var filterOrder = {
		allfriends: 1,
		friendsoffriends: 2,
		everyone: 3
	};

	var i, cur;
	for (i = 0; i < filter.length; i += 1) {
		cur = filter[i];
		if (currentFilterOrder > filterOrder[cur]) {
			currentFilter = cur;
			currentFilterOrder = filterOrder[cur];
		}
	}

	return currentFilter;
}

function getAllFriendsIDs(view, cb) {
	step(function () {
		Friends.get(view, this);
	}, cb);
}

function getFriendsOfFriendsIDs(view, cb) {
	step(function () {
		Friends.getFriendsOfFriends(view, this);
	}, cb);
}

//TODO!
function getUserIDsFromAlwaysFilter(view, filters, cb) {
	var theFilter = removeDoubleFilter(filters);

	switch (theFilter) {
		case "allfriends":
			getAllFriendsIDs(view, cb);
			break;
		case "friendsoffriends":
			getFriendsOfFriendsIDs(view, cb);
			break;
		case "everyone":
			//TODO: how do we want to do this? who is "everyone"? -> most likely add some "share lists" for friendsoffriends
			break;
		default:
			throw new InvalidFilter("unknown always value");
	}
}

function getUserIDsForFilter(view, filter, cb) {
	//filter.user
	//filter.meta
		//allfriends
		//friendsoffriends

	//get everyone I might be interested in also considering filter criteria
	var alwaysFilter = [], userFilter = [];

	if (!filter) {
		filter = ["always:allfriends"];
	}

	var i, map;
	for (i = 0; i < filter.length; i += 1) {
		map = filter[i].split(":");
		switch(map[0]) {
			case "always":
				alwaysFilter.push(map[1]);
				break;
			case "user":
				userFilter.push(map[1]);
				break;
			default:
				throw new InvalidFilter("unknown group");
		}
	}

	step(function () {
		this.parallel.unflatten();

		getUserIDsFromAlwaysFilter(view, alwaysFilter, this.parallel());
		getUserIDsFromUserFilter(userFilter, this.parallel());
	}, function (alwaysUserIDs, userUserIDs) {
		//unique!
		var result = h.arrayUnique(alwaysUserIDs.concat(userUserIDs));
		this.ne(result);
	}, cb);
}

Post.getTimeline = function (view, filter, cb) {
	//get all users who we want to get posts for
	//generate redis key names
	//zinterstore
	//zrank
	//get post data
	var unionKey;

	step(function () {
		getUserIDsForFilter(view, filter, this);
	}, h.sF(function (userids) {
		var postKeys = userids.map(function (userid) {
			return "user:" + userid + ":posts";
		});

		unionKey = userids.sort().join(",");
		postKeys.unshift("temp:" + view.getUserID() + ":" + unionKey);

		client.zunionstore(postKeys);
	}), h.sF(function (count) {
		if (count === 0) {
			this.last.ne([]);
		} else {
			client.zrevrange("temp:" + view.getUserID() + ":" + unionKey, 0, 19);
		}
	}), cb);
};

Post.getUserWall = function (view, userid, start, count, cb) {
	step(function () {
		start = start || 1;
		count = Math.max(20, parseInt(count, 10));

		client.zrevrange("user:" + userid + ":wall", start - 1, start + count - 1, this);
	}, cb);
};

Post.validateFormat = function (data) {
	step(function () {
		if (!data.content) {
			throw new InvalidPost("content missing");
		}

		if (!data.key && data.readers || data.key && !data.readers) {
			throw new InvalidPost("readers and keys need each other");
		}

		//TODO: check time is not too long ago

		//TODO: add those functions/rename
		if (data.key && KeyApi.InvalidKeyData(data.key)) {
			throw new InvalidPost("invalid key");
		}
	});
};

Post.create = function (view, data, cb) {
	var SymKey = require("./crypto/symKey");

	step(function () {
		Post.validateFormat(data, this);
	}, h.sF(function () {
		var id = 0;
		var readers = data.readers;

		//TODO: what are the readers? shouldn't they only be defined by the keys used?
		if (!readers) {
			//set readers to all friends.
			//they will not need a key to decrypt this post
			readers = ["always:allfriends"];
		}

		if (data.meta.key) {
			SymKey.createWDecryptors(view, data.meta.key);
		}

		var multi = client.multi();
		multi.zadd("user:" + view.getUserID() + ":posts", data.time, id);

		if (data.receiver) {
			multi.zadd("user:" + data.receiver + ":wall", data.time, id);
		}

		multi.hmset("post:" + id + ":meta", data.meta);
		multi.set("post:" + id + ":content", data.content);

		//notify every reader? NOPE
		//or collect new posts and let the readers grab them time by time? -> yes (mainly zinterstore, zrevrange)

		//anyhow:
		//notify wall user and mentioned users.
	}), cb);
};

module.exports = Post;