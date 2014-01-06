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
	getTimeline: function (data, fn, view) {},
	getWall: function (data, fn, view) {}
};

module.exports = p;