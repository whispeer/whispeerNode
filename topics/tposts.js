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
	getTimeline: function (data, fn, view) {
		step(function () {
			Post.getTimeline(view, data.filter, data.start, data.count, this);
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
	getWall: function (data, fn, view) {
		step(function () {
			Post.getUserWall(view, data.userid, data.start, data.count, this);
		}, h.sF(function (posts) {
			var i;
			for (i = 0; i < posts.length; i += 1) {
				posts[i].getPostData(view, this.parallel(), data.addKey);
			}
		}), h.sF(function () {
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