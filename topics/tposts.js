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
	getPost: function (data, fn, view) {
		step(function () {
			Post.get(view, data.postid, this);
		}, h.sF(function (thePost) {
			thePost.getPostData(view, this, data.addKey);
		}), h.sF(function (data) {
			this.ne({
				post: data
			});
		}), fn);
	},
	getNewestTimeline: function (data, fn, view) {
		var remainingPosts = false;
		step(function () {
			Post.getNewestPosts(view, data.filter, data.beforeID, data.count, data.lastRequestTime, this);
		}, h.sF(function (posts, remaining) {
			remainingPosts = remaining;

			if (posts.length === 0) {
				this.ne([]);
			}

			posts.forEach(function (e) {
				e.getPostData(view, this.parallel(), data.addKey);
			}, this)
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
		}; TimeSpanExceeded), fn);
	},
	getTimeline: function (data, fn, view) {
		var remainingPosts;

		step(function () {
			Post.getTimeline(view, data.filter, data.afterID, data.count, this);
		}, h.sF(function (posts, remaining) {
			remainingPosts = remaining;

			if (posts.length === 0) {
				this.ne([]);
			}

			var i;
			for (i = 0; i < posts.length; i += 1) {
				posts[i].getPostData(view, this.parallel(), data.addKey);
			}
		}), h.sF(function (data) {
			this.ne({
				posts: data,
				remaining: remainingPosts
			});
		}), fn);
	},
	getWall: function (data, fn, view) {
		step(function () {
			Post.getUserWall(view, data.userid, data.afterID, data.count, this);
		}, h.sF(function (posts) {
			if (posts.length === 0) {
				this.ne([]);
			}

			var i;
			for (i = 0; i < posts.length; i += 1) {
				posts[i].getPostData(view, this.parallel(), data.addKey);
			}
		}), h.sF(function (data) {
			this.ne({
				posts: data
				//TODO: remaining: false|true
			});
		}), fn);
	},
	createPost: function (data, fn, view) {
		step(function () {
			Post.create(view, data.postData, this);
		}, h.sF(function (thePost) {
			thePost.getPostData(view, this);
		}), h.sF(function (data) {
			this.ne({
				createdPost: data
			});
		}), fn);
	}
};

module.exports = p;