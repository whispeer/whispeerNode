"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var Friends = require("./friends");

var Paginator = require("./paginator");
var SymKey = require("./crypto/symKey");

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
	var domain = "post:" + postid, thePost = this;
	this.getPostData = function getDataF(view, cb, key) {
		step(function () {
			this.parallel.unflatten();

			client.hgetall(domain + ":meta", this.parallel());
			client.hgetall(domain + ":content", this.parallel());
		}, h.sF(function (meta, content) {
			var result = {
				id: postid,
				meta: meta,
				content: content
			};

			this.ne(result);
		}), cb);
	};

	this.hasUserAccess = function (userid, cb) {
		step(function () {
			client.hget(domain, "key", this);
		}, h.sF(function (keyRealID) {
			client.sismember("key:" + keyRealID + ":access", userid, this);
		}), cb);
	};

	this.throwUserAccess = function throwUserAccessF(view, cb) {
		var that = this;
		step(function () {
			that.hasUserAccess(this);
		}, h.sF(function (access) {
			if (!access) {
				throw new AccessViolation("user has no access to post");
			}

			this.ne();
		}), cb);
	};

	this.getKey = function getKeyF(view, cb) {
		step(function () {
			client.hget(domain, "key", this);
		}, cb);
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
		if (currentFilterOrder < filterOrder[cur]) {
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
	}, h.sF(function (alwaysUserIDs, userUserIDs) {
		alwaysUserIDs.push(view.getUserID());
		//unique!
		var result = h.arrayUnique(alwaysUserIDs.concat(userUserIDs).map(h.parseDecimal));
		this.ne(result);
	}), cb);
}

Post.getTimeline = function (view, filter, start, count, cb) {
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
		postKeys.unshift(postKeys.length);
		postKeys.unshift("post:union:" + view.getUserID() + ":" + unionKey);
		postKeys.push(this);

		client.zunionstore.apply(client, postKeys);
	}), h.sF(function (count) {
		if (count === 0) {
			this.last.ne([]);
		} else {
			var paginator = new Paginator(start, count);
			client.zrevrange("post:union:" + view.getUserID() + ":" + unionKey, paginator.rangeBegin(), paginator.rangeEnd(), this);
			client.expire("post:union" + view.getUserID() + ":" + unionKey, 120);
		}
	}), h.sF(function (ids) {
		var result = [], i;
		for (i = 0; i < ids.length; i += 1) {
			result.push(new Post(ids[i]));
		}
		this.ne(result);
	}), cb);
};

Post.getUserWall = function (view, userid, start, count, cb) {
	step(function () {
		start = start || 1;
		count = Math.max(20, parseInt(count, 10));

		var paginator = new Paginator(start, count);
		client.zrevrange("user:" + userid + ":wall", paginator.rangeBegin(), paginator.rangeEnd(), this);
	}, h.sF(function () {
		//TODO
	}), cb);
};

Post.validateFormat = function (data, cb) {
	step(function () {
		var err = validator.validate("post", data);

		if (err) {
			throw new InvalidPost(err);
		}

		var current = new Date().getTime();

		if (Math.abs(data.meta.time - current) > 20 * 1000) {
			throw new InvalidPost("time too old");
		}

		if (data.meta.key) {
			KeyApi.validate(data.meta.key, this);
		} else {
			this();
		}
	}, cb);
};

function processWallUser(userid, cb) {
	if (userid) {
		step(function () {
			User.get(userid, this);
		}, h.sF(function (user) {
			this.ne(user.getID());
		}), cb);
	} else {
		cb();
	}
}

function processKey(view, keyData, cb) {
	if (keyData) {
		step(function () {
			SymKey.createWDecryptors(view, keyData, this);
		}, h.sF(function (key) {
			this.ne(key.getRealID());
		}), cb);
	} else {
		cb();
	}
}

function processMetaInformation(view, meta, cb) {
	step(function () {
		this.parallel.unflatten();

		processWallUser(meta.walluser, this.parallel());
		processKey(view, meta.key, this.parallel());
	}, h.sF(function (userid, keyid) {
		meta.walluser = userid;
		meta.key = keyid;

		this.ne();
	}), cb);
}

function removeOldNewPosts(multi, userid) {
	var minTime = new Date().getTime() - 2 * 60 * 1000;
	multi.zremrangebyscore("user:" + userid + ":newPosts", "-inf", minTime);
}

Post.create = function (view, data, cb) {
	/*
	post: {
		meta: {
			contentHash,
			time,
			signature,
			(key),
			(walluser), //for a wallpost
		}
		content //padded!
	}
	*/

	var postID;

	step(function () {
		Post.validateFormat(data, this);
	}, h.sF(function () {
		processMetaInformation(view, data.meta, this);
	}), h.sF(function () {
		client.incr("post", this);
	}), h.sF(function (id) {
		postID = id;
		var multi = client.multi();
		multi.zadd("user:" + view.getUserID() + ":posts", data.meta.time, id);

		if (data.meta.walluser) {
			multi.zadd("user:" + data.meta.walluser + ":wall", data.meta.time, id);
		}

		multi.hmset("post:" + id + ":meta", data.meta);
		multi.set("post:" + id, id);
		multi.hmset("post:" + id + ":content", data.content);

		removeOldNewPosts(multi, view.getUserID());
		multi.zadd("user:" + view.getUserID() + ":newPosts", data.meta.time, id);

		multi.exec(this);
	}), h.sF(function () {
		//TODO: notify wall user and mentioned users.

		//collect new posts and let the readers grab them time by time? -> yes (mainly zinterstore, zrevrangebyscore)
		this.ne(new Post(postID));
	}), cb);
};

//we need this if someone links directly to a post.
Post.get = function (view, postid, cb) {
	var thePost;
	step(function () {
		if (h.isInt(postid)) {
			client.get("post:" + postid);
		} else {
			throw new AccessViolation();
		}
	}, h.sF(function (id) {
		thePost = new Post(id);

		thePost.throwUserAccess(this);
	}), h.sF(function () {
		this.ne(thePost);
	}), cb);
};

module.exports = Post;
