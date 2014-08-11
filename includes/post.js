"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");

var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");
var Friends = require("./friends");

var SortedSetPaginator = require("./sortedSetPaginator");
var SymKey = require("./crypto/symKey");

var mailer = require("./mailer");

var newPostsExpireTime = 10 * 60;

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
	var domain = "post:" + postid, thePost = this, result;
	this.getPostData = function getDataF(request, cb) {
		step(function () {
			this.parallel.unflatten();

			client.hgetall(domain + ":meta", this.parallel());
			client.hgetall(domain + ":content", this.parallel());
		}, h.sF(function (meta, content) {
			meta.sender = h.parseDecimal(meta.sender);
			meta.time = h.parseDecimal(meta.time);
			meta.walluser = h.parseDecimal(meta.walluser || 0);

			result = {
				id: postid,
				meta: meta,
				content: content
			};

			request.addKey(meta._key, this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	};

	this.hasUserAccess = function (userid, cb) {
		step(function () {
			client.hget(domain, "_key", this);
		}, h.sF(function (keyRealID) {
			client.sismember("key:" + keyRealID + ":access", userid, this);
		}), cb);
	};

	this.throwUserAccess = function throwUserAccessF(request, cb) {
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

	this.getContent = function getContentF(request, cb) {
		step(function () {
			thePost.throwUserAccess(request, this);
		}, h.sF(function () {
			client.hget(domain, "content", this);
		}), cb);
	};
};

function removeOldNewPosts(multi, userid) {
	var minTime = new Date().getTime() - newPostsExpireTime * 1000;
	multi.zremrangebyscore("user:" + userid + ":newPosts", "-inf", minTime);
}

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

function getAllFriendsIDs(request, cb) {
	step(function () {
		Friends.get(request, this);
	}, cb);
}

function getFriendsOfFriendsIDs(request, cb) {
	step(function () {
		Friends.getFriendsOfFriends(request, this);
	}, cb);
}

function getUserIDsFromAlwaysFilter(request, filters, cb) {
	var theFilter = removeDoubleFilter(filters);

	if (!theFilter) {
		cb(null, []);
		return;
	}

	switch (theFilter) {
		case "allfriends":
			getAllFriendsIDs(request, cb);
			break;
		case "friendsoffriends":
			getFriendsOfFriendsIDs(request, cb);
			break;
		case "everyone":
			//TODO: how do we want to do this? who is "everyone"? -> most likely add some "share lists" for friendsoffriends
			break;
		default:
			throw new InvalidFilter("unknown always value");
	}
}

function getUserIDsForFilter(request, filter, cb) {
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

		getUserIDsFromAlwaysFilter(request, alwaysFilter, this.parallel());
		getUserIDsFromUserFilter(userFilter, this.parallel());
	}, h.sF(function (alwaysUserIDs, userUserIDs) {
		alwaysUserIDs.push(request.session.getUserID());
		//unique!
		var result = h.arrayUnique(alwaysUserIDs.concat(userUserIDs).map(h.parseDecimal));
		this.ne(result);
	}), cb);
}

// Problem:
// we get more posts than applicable for us, not removing those we can not read

function accessablePostFilter(request) {
	return function (id, cb) {
		step(function () {
			client.hget("post:" + id + ":meta", "_key", this);
		}, h.sF(function (key) {
			client.sismember("key:" + key + ":access", request.session.getUserID(), this);
		}), cb);
	};
}

Post.getTimeline = function (request, filter, afterID, count, cb) {
	//get all users who we want to get posts for
	//generate redis key names
	//zinterstore
	//zrank
	//get post data
	var unionKey;

	step(function () {
		getUserIDsForFilter(request, filter, this);
	}, h.sF(function (userids) {
		var postKeys = userids.map(function (userid) {
			return "user:" + userid + ":posts";
		});

		unionKey = "post:union:" + request.session.getUserID() + ":" + userids.sort().join(",");
		postKeys.unshift(postKeys.length);
		postKeys.unshift(unionKey);
		postKeys.push(this);

		client.zunionstore.apply(client, postKeys);
	}), h.sF(function (resultLength) {
		if (resultLength === 0) {
			this.last.ne([]);
		} else {
			var paginator = new SortedSetPaginator(unionKey, count);
			client.expire(unionKey, 120);

			paginator.getRangeAfterID(afterID, this, accessablePostFilter(request));
		}		
	}), h.sF(function (ids, remaining) {
		var result = ids.map(h.newElement(Post));
		this.ne(result, remaining);
	}), cb);
};

Post.getNewestPosts = function (request, filter, beforeID, count, lastRequestTime, cb) {
	var unionKey, userids;

	step(function () {
		if (new Date().getTime() - h.parseDecimal(lastRequestTime) > newPostsExpireTime * 1000) {
			throw new TimeSpanExceeded();
		} else {
			getUserIDsForFilter(request, filter, this);
		}
	}, h.sF(function (_userids) {
		userids = _userids;
		var multi = client.multi();

		userids.forEach(function (userid) {
			removeOldNewPosts(multi, userid);
		});

		multi.exec(this);
	}), h.sF(function () {
		var postKeys = userids.map(function (userid) {
			return "user:" + userid + ":newPosts";
		});

		unionKey = "post:union:" + request.session.getUserID() + ":newPosts:" + userids.sort().join(",");
		postKeys.unshift(postKeys.length);
		postKeys.unshift(unionKey);
		postKeys.push(this);

		client.zunionstore.apply(client, postKeys);
	}), h.sF(function (resultLength) {
		if (resultLength === 0) {
			this.last.ne([]);
		} else {
			var paginator = new SortedSetPaginator(unionKey, count, true);
			client.expire(unionKey, 120);

			paginator.getRangeAfterID(beforeID, this, accessablePostFilter(request));
		}		
	}), h.sF(function (ids, remaining) {
		var result = ids.reverse().map(h.newElement(Post));
		this.ne(result, remaining);
	}), cb);
};

Post.getUserWall = function (request, userid, afterID, count, cb) {
	step(function () {
		var paginator = new SortedSetPaginator("user:" + userid + ":wall", count);
		paginator.getRangeAfterID(afterID, this, function (id, cb) {
			step(function () {
				client.hget("post:" + id + ":meta", "_key", this);
			}, h.sF(function (key) {
				client.sismember("key:" + key + ":access", request.session.getUserID(), this);
			}), cb);
		});
	}, h.sF(function (ids) {
		var result = ids.map(h.newElement(Post));
		this.ne(result);
	}), cb);
};

Post.validateFormat = function (data, cb) {
	step(function () {
		var err = validator.validate("post", data);

		if (err) {
			throw new InvalidPost(err);
		}

		var current = new Date().getTime();

		if (Math.abs(data.meta.time - current) > 5 * 60 * 1000) {
			throw new InvalidPost("time too old");
		}

		KeyApi.validate(data.meta._key, this);
	}, cb);
};

function processWallUser(userid, cb) {
	if (userid) {
		step(function () {
			User.getUser(userid, this);
		}, cb);
	} else {
		cb();
	}
}

function processKey(request, keyData, cb) {
	if (keyData) {
		step(function () {
			SymKey.createWDecryptors(request, keyData, this);
		}, h.sF(function (key) {
			this.ne(key.getRealID());
		}), cb);
	} else {
		cb();
	}
}

function processMetaInformation(request, meta, cb) {
	step(function () {
		this.parallel.unflatten();

		processWallUser(meta.walluser, this.parallel());
		processKey(request, meta._key, this.parallel());
	}, h.sF(function (user, keyid) {
		if (user) {
			meta.walluserObj = user;
			meta.walluser = user.getID();
		} else {
			delete meta.walluser;
		}

		meta._key = keyid;

		this.ne();
	}), cb);
}

Post.create = function (request, data, cb) {
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
		if (data.meta.sender !== request.session.getUserID()) {
			throw new InvalidPost("incorrect sender!");
		}

		Post.validateFormat(data, this);
	}, h.sF(function () {
		processMetaInformation(request, data.meta, this);
	}), h.sF(function () {
		client.incr("post", this);
	}), h.sF(function (id) {
		postID = id;
		var multi = client.multi();
		multi.zadd("user:" + request.session.getUserID() + ":posts", data.meta.time, id);

		if (data.meta.walluser) {
			multi.zadd("user:" + data.meta.walluser + ":wall", data.meta.time, id);
		}

		multi.hmset("post:" + id + ":meta", data.meta);
		multi.set("post:" + id, id);
		multi.hmset("post:" + id + ":content", data.content);

		removeOldNewPosts(multi, request.session.getUserID());
		multi.zadd("user:" + request.session.getUserID() + ":wall", data.meta.time, id);
		multi.zadd("user:" + request.session.getUserID() + ":newPosts", data.meta.time, id);
		multi.expire("user:" + request.session.getUserID() + ":newPosts", newPostsExpireTime);

		multi.exec(this);
	}), h.sF(function () {
		if (data.meta.walluserObj) {
			mailer.sendInteractionMails([data.meta.walluserObj]);
		}
		//TODO: notify wall user and mentioned users.

		//collect new posts and let the readers grab them time by time? -> yes (mainly zinterstore, zrevrangebyscore)
		this.ne(new Post(postID));
	}), cb);
};

//we need this if someone links directly to a post.
Post.get = function (request, postid, cb) {
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
