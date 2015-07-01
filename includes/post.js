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

var RedisObserver = require("./asset/redisObserver");

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

var MAXTIME = 60 * 60 * 1000;

var Post = function (postid) {
	var domain = "post:" + postid, thePost = this, result;

	this.addComment = function (request, content, meta, cb) {
		var commentID = 0;
		step(function () {
			//TODO: check data
			//TODO: check comment ordering!
			client.zrevrange(domain + ":comments:list", 0, 0, this);
		}, h.sF(function (newest) {
			this.parallel.unflatten();

			client.hget(domain + ":meta", "_ownHash", this.parallel());
			if (newest.length !== 0) {
				client.hget(domain + ":comments:" + newest[0] + ":meta", "_sortCounter", this.parallel());
			}
		}), h.sF(function (ownHash, sorting) {
			if (meta._parent !== ownHash) {
				console.log(meta._parent);
				console.log(ownHash);
				throw new Error("invalid parent data");
			}

			if (sorting > meta._sortCounter || (sorting > 0 && !meta._sortCounter)) {
				throw new Error("invalid counter - " + sorting + " - " + meta._sortCounter);
			}

			client.incr(domain + ":comments:count", this);
		}), h.sF(function (id) {
			commentID = id;
			var m = client.multi();
			m.hmset(domain + ":comments:" + id + ":content", content);
			m.hmset(domain + ":comments:" + id + ":meta", meta);
			m.zadd(domain + ":comments:list", new Date().getTime(), id);

			m.exec(this);
		}), h.sF(function () {
			thePost.notify("comment:create", commentID);
			thePost.getSender(this);
		}), h.sF(function (sender) {
			mailer.sendInteractionMails([sender]);

			this.ne();
		}), cb);
	};

	this.getSender = function (cb) {
		step(function () {
			client.hget(domain + ":meta", "sender", this);
		}, h.sF(function (senderID) {
			User.getUser(senderID, this);
		}), cb);
	};

	this.getComment = function (id, cb) {
		step(function () {
			this.parallel.unflatten();
			client.hgetall(domain + ":comments:" + id + ":content", this.parallel());
			client.hgetall(domain + ":comments:" + id + ":meta", this.parallel());
		}, h.sF(function (content, meta) {
			this.ne({
				id: id,
				content: content,
				meta: meta
			});
		}), cb);
	};

	this.getComments = function (request, cb) {
		step(function () {
			client.zrange(domain + ":comments:list", 0, -1, this);
		}, h.sF(function (comments) {
			if (comments.length === 0) {
				this.last.ne([]);
				return;
			}

			comments.forEach(function (comment) {
				thePost.getComment(comment, this.parallel());
			}, this);
		}), cb);
	};

	this.getPostData = function getDataF(request, cb) {
		step(function () {
			this.parallel.unflatten();

			client.hgetall(domain + ":meta", this.parallel());
			client.hgetall(domain + ":content", this.parallel());
			thePost.getComments(request, this.parallel());
		}, h.sF(function (meta, content, comments) {
			meta.sender = h.parseDecimal(meta.sender);
			meta.time = h.parseDecimal(meta.time);
			meta.walluser = h.parseDecimal(meta.walluser || 0);

			if (meta.images) {
				meta.images = JSON.parse(meta.images);
			}

			result = {
				id: postid,
				meta: meta,
				content: content,
				comments: comments
			};

			request.addKey(meta._key, this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	};

	this.hasUserAccess = function (userid, cb) {
		step(function () {
			client.hget(domain + ":meta", "_key", this);
		}, h.sF(function (keyRealID) {
			client.sismember("key:" + keyRealID + ":access", userid, this);
		}), cb);
	};

	this.throwUserAccess = function throwUserAccessF(request, cb) {
		var that = this;
		step(function () {
			that.hasUserAccess(request.session.getUserID(), this);
		}, h.sF(function (access) {
			if (!access) {
				throw new AccessViolation("user has no access to post");
			}

			this.ne();
		}), cb);
	};

	/**
	* delete this post. only works if requester is post creator (or wall-user)
	*/
	this.remove = function (request, cb) {
		step(function () {
			//check if i am the walluser or the sender
			this.parallel.unflatten();

			client.hget(domain + ":meta", "sender", this.parallel());
			client.hget(domain + ":meta", "walluser", this.parallel());
		}, h.sF(function (sender, walluser) {
			sender = h.parseDecimal(sender);
			walluser = h.parseDecimal(walluser);

			if (request.session.getUserID() !== sender && request.session.getUserID() !== walluser) {
				throw new AccessViolation("can not delete other peoples posts");
			}

			//remove post from all lists
			var m = client.multi();

			//TODO: remove post data, for now not removing it!
			//m.del(domain + ":meta");
			//m.del(domain + ":content");
			//m.del(domain);

			m.zrem("user:" + sender + ":posts", postid);
			m.zrem("user:" + sender + ":newPosts", postid);
			m.zrem("user:" + sender + ":wall", postid);

			if (walluser) {
				m.zrem("user:" + walluser + ":wall", postid);
			}

			//TODO: remove comments when added!

			m.exec(this);
		}), cb);
	};

	RedisObserver.call(this, "post", postid);
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

function makePost(request, id) {
	var post = new Post(id);

	var socketData = request.socketData;
	post.listen(socketData, "comment:create", function (channel, data, postID) {
		step(function () {
			var p = new Post(postID);
			p.getComment(data, this);
		}, h.sF(function (comment) {
			socketData.socket.emit("post." + postID + ".comment.new", comment);
		}), function (e) {
			if (e) {
				console.error(e);
			}
		});
	});

	return post;
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
		var result = ids.map(function (id) {
			return makePost(request, id);
		});
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

		if (Math.abs(data.meta.time - current) > MAXTIME) {
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

function processImages(request, images, keys, cb) {
	step(function () {
		keys.forEach(function (key) {
			SymKey.createWDecryptors(request, key, this.parallel());
		}, this);
	}, cb);
}

function processMetaInformation(request, meta, cb) {
	step(function () {
		this.parallel.unflatten();

		processWallUser(meta.walluser, this.parallel());
		processKey(request, meta._key, this.parallel());
	}, h.sF(function (user, keyid) {
		if (user) {
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

	var postID, wallUserObj;

	step(function () {
		if (data.meta.sender !== request.session.getUserID()) {
			throw new InvalidPost("incorrect sender!");
		}

		Post.validateFormat(data, this);
	}, h.sF(function () {
		processMetaInformation(request, data.meta, this);
	}), h.sF(function () {
		if (data.meta.images.length > 0) {
			processImages(request, data.meta.images, data.imageKeys, this);
		} else {
			this.ne();
		}
	}), h.sF(function () {
		client.incr("post", this);
	}), h.sF(function (id) {
		if (data.meta.images) {
			data.meta.images = JSON.stringify(data.meta.images);
		}

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
		if (wallUserObj) {
			mailer.sendInteractionMails([wallUserObj]);
		}
		//TODO: notify wall user and mentioned users.

		//collect new posts and let the readers grab them time by time? -> yes (mainly zinterstore, zrevrangebyscore)
		this.ne(makePost(request, postID));
	}), cb);
};

//we need this if someone links directly to a post.
Post.get = function (request, postid, cb) {
	var thePost;
	step(function () {
		if (h.isInt(postid)) {
			client.get("post:" + postid, this);
		} else {
			throw new AccessViolation("invalid post id");
		}
	}, h.sF(function (id) {
		thePost = makePost(request, id);

		thePost.throwUserAccess(request, this);
	}), h.sF(function () {
		this.ne(thePost);
	}), cb);
};

module.exports = Post;
