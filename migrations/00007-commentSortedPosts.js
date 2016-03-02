"use strict";

var step = require("step");
var Bluebird = require("bluebird");
var h = require("whispeerHelper");

var client = require("../includes/redisClient");

function addCommentSortedPosts(cb) {
	step.unpromisify(client.smembersAsync("user:list").each(function (uid) {
		return Bluebird.all([
			client.zrangeAsync("user:" + uid + ":posts", 0, -1),
			client.delAsync("user:" + uid + ":newPosts")
		]).spread(function (posts) {
			return posts;
		}).map(function (postID) {
			return Bluebird.all([
				client.hgetAsync("post:" + postID + ":meta", "time"),
				client.zrangeAsync("post:" + postID + ":comments:list", 0, -1, "WITHSCORES")
			]).spread(function (postTime, comments) {
				var newestCommentTime = comments.filter(function (v, i) {
					return i%2;
				}).map(h.parseDecimal).sort(function (a, b) {
					return b - a;
				})[0];

				if (newestCommentTime) {
					console.log("Adding with comment time: " + postID + " - " + newestCommentTime);
					return client.zaddAsync("user:" + uid + ":postsByComment", newestCommentTime, postID);
				}

				console.log("No Comments: " + postID + " - " + postTime);
				return client.zaddAsync("user:" + uid + ":postsByComment", postTime, postID);
			});
		});
	}), cb);
}

module.exports = addCommentSortedPosts;
