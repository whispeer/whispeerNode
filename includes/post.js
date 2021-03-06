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

var Notification = require("./notification");

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

	this.deleteComment = function (request, commentID, cb) {
		client.hgetAsync(domain + ":comments:" + commentID + ":meta", "sender").then(function (senderID) {
			if (h.parseDecimal(senderID) !== request.session.getUserID()) {
				throw new AccessViolation("User tried to delete comment of another user");
			}

			return client.zremAsync(domain + ":comments:list", commentID);
		}).nodeify(cb);
	};

	this.addComment = function (request, content, meta, cb) {
		var commentID = 0;
		step(function () {
			if (request.session.getUserID() !== h.parseDecimal(meta.sender)) {
				throw new AccessViolation("Invalid sender!");
			}

			//TODO: check data
			client.zrevrange(domain + ":comments:list", 0, 0, this);
		}, h.sF(function (newest) {
			this.parallel.unflatten();

			client.hget(domain + ":meta", "_ownHash", this.parallel());
			if (newest.length !== 0) {
				client.hget(domain + ":comments:" + newest[0] + ":meta", "_sortCounter", this.parallel());
			}
		}), h.sF(function (ownHash, sorting) {
			if (meta._parent !== ownHash) {
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
			Notification.add([sender], "post", "comment", postid);

			client.zadd("user:" + sender.getID() + ":postsByComment", new Date().getTime(), postid, this);
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
			client.get(domain + ":private", this.parallel());
			thePost.getComments(request, this.parallel());
		}, h.sF(function (meta, content, privateData, comments) {
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

			if (meta.sender === request.session.getUserID()) {
				result.private = JSON.parse(privateData);
			}

			request.addKey(meta._key, this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	};

	this.hasUserAccess = function (userid) {
		return client.hgetAsync(domain + ":meta", "_key").then((keyRealID) => {
			return client.sismemberAsync("key:" + keyRealID + ":access", userid);
		})
	};

	this.throwUserAccess = function (request) {
		return this.hasUserAccess(request.session.getUserID()).then(function (access) {
			if (!access) {
				throw new AccessViolation("user has no access to post");
			}
		})
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
			m.zrem("user:" + sender + ":postsByComment", postid);
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
				alwaysFilter.push("allfriends");
				break;
				//throw new InvalidFilter("unknown group");
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

Post.getTimeline = function (request, filter, afterID, count, sortByCommentTime, cb) {
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
			if (!sortByCommentTime) {
				return "user:" + userid + ":posts";
			} else {
				return "user:" + userid + ":postsByComment";
			}
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

		KeyApi.validate(data.meta._key);

		this.ne()
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
			SymKey.create(request, keyData, this);
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
			SymKey.create(request, key, this.parallel());
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

		this.ne(user);
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

	var postID, wallUser;

	step(function () {
		if (data.meta.sender !== request.session.getUserID()) {
			throw new InvalidPost("incorrect sender!");
		}

		Post.validateFormat(data, this);
	}, h.sF(function () {
		processMetaInformation(request, data.meta, this);
	}), h.sF(function (_wallUser) {
		wallUser = _wallUser;

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
		multi.zadd("user:" + request.session.getUserID() + ":postsByComment", data.meta.time, id);

		if (data.meta.walluser) {
			multi.zadd("user:" + data.meta.walluser + ":wall", data.meta.time, id);
		}

		multi.set("post:" + id + ":private", JSON.stringify(data.privateData));
		multi.hmset("post:" + id + ":meta", data.meta);
		multi.set("post:" + id, id);
		multi.hmset("post:" + id + ":content", data.content);

		multi.zadd("user:" + request.session.getUserID() + ":wall", data.meta.time, id);

		multi.exec(this);
	}), h.sF(function () {
		if (wallUser) {
			Notification.add([wallUser], "post", "wall", postID);
		}

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

		return thePost.throwUserAccess(request);
	}), h.sF(function () {
		this.ne(thePost);
	}), cb);
};

module.exports = Post;
