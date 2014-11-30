"use strict";

var step = require("step");
var h = require("whispeerHelper");

var Post = require("../includes/post");

/*
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

var p = {
	comment: {
		create: function (data, fn, request) {
			step(function () {
				Post.get(request, h.parseDecimal(data.postID), this);
			}, h.sF(function (thePost) {
				thePost.addComment(request, data.comment.content, data.comment.meta, this);
			}), h.sF(function () {
				this.ne({
					created: true
				});
			}), fn);
		}
	},
	remove: function (data, fn, request) {
		step(function () {
			Post.get(request, data.postid, this);
		}, h.sF(function (post) {
			post.remove(request, this);
		}), h.sF(function () {
			this.ne({
				removed: true
			});
		}), fn);
	},
	getPost: function (data, fn, request) {
		step(function () {
			Post.get(request, data.postid, this);
		}, h.sF(function (thePost) {
			thePost.getPostData(request, this, data.addKey);
		}), h.sF(function (data) {
			this.ne({
				post: data
			});
		}), fn);
	},
	getNewestTimeline: function (data, fn, request) {
		var remainingPosts = false;
		step(function () {
			Post.getNewestPosts(request, data.filter, data.beforeID, data.count, data.lastRequestTime, this);
		}, h.sF(function (posts, remaining) {
			remainingPosts = remaining;

			if (posts.length === 0) {
				this.ne([]);
			}

			posts.forEach(function (e) {
				e.getPostData(request, this.parallel(), data.addKey);
			}, this);
		}), h.hE(function (err, data) {
			if (err) {
				this.ne({
					timeSpanExceeded: true
				});
			} else {
				this.ne({
					posts: data,
					remaining: remainingPosts
				});
			}
		}, [TimeSpanExceeded]), fn);
	},
	getTimeline: function (data, fn, request) {
		var remainingPosts;

		step(function () {
			Post.getTimeline(request, data.filter, data.afterID, data.count, this);
		}, h.sF(function (posts, remaining) {
			remainingPosts = remaining;

			if (posts.length === 0) {
				this.ne([]);
			}

			var i;
			for (i = 0; i < posts.length; i += 1) {
				posts[i].getPostData(request, this.parallel(), data.addKey);
			}
		}), h.sF(function (data) {
			this.ne({
				posts: data,
				remaining: remainingPosts
			});
		}), fn);
	},
	getWall: function (data, fn, request) {
		step(function () {
			Post.getUserWall(request, data.userid, data.afterID, data.count, this);
		}, h.sF(function (posts) {
			if (posts.length === 0) {
				this.ne([]);
			}

			var i;
			for (i = 0; i < posts.length; i += 1) {
				posts[i].getPostData(request, this.parallel(), data.addKey);
			}
		}), h.sF(function (data) {
			this.ne({
				posts: data
				//TODO: remaining: false|true
			});
		}), fn);
	},
	createPost: function (data, fn, request) {
		step(function () {
			Post.create(request, data.postData, this);
		}, h.sF(function (thePost) {
			thePost.getPostData(request, this);
		}), h.sF(function (data) {
			this.ne({
				createdPost: data
			});
		}), fn);
	}
};

module.exports = p;