"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");

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

var contains = {
	"friendsoffriends": ["allfriends"],
	"everyone": ["friendsoffriends", "allfriends"]
};

function getUserIDsFromUserFilter(filter, cb) {
	step(function () {
		if (filter.length > 0) {
			var i;
			for (i = 0; i < filter.length; i += 1) {
				User.getUser(filter[i], this.parallel());
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

//TODO!
function getUserIDsFromAlwaysFilter(filter, cb) {
	step(function () {
		var i;
		for (i = 0; i < filter.length; i += 1) {
			switch (filter) {
				case "allfriends":
					break;
				case "friendsoffriends":
					break;
				case "everyone":
					break;
				default:
					throw new InvalidFilter("unknown always value");
			}
		}

		this.last.ne([]);
	}, cb);
}

function getUserIDsForFilter(filter, cb) {
	//filter.user
	//filter.meta
		//allFriends
		//friendsOfFriends

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

		getUserIDsFromAlwaysFilter(alwaysFilter, this.parallel());
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
		getUserIDsForFilter(filter, this);
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

Post.getUserWall = function (view, userid, cb) {
	client.zrevrange("user:" + userid + ":wall", 0, 19, cb);
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
		//TODO: check time is not to long ago
		Post.validateFormat(data);
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
		//or collect new posts and let the readers grab them time by time? -> yes (mainly zinterstore, zrevrank)
		//anyhow:
		//notify wall user and mentioned users.
	}), cb);
};

module.exports = Post;