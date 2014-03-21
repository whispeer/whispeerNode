"use strict";
var rs = require("redis-search");
var client = require("./redisClient");

function makeSearch(key) {
	return rs.createSearch({
		service: "",
		key: key,
		client: client
	});
}

var userSearch = makeSearch("user");

var search = {
	user: userSearch,
	friendsSearch: function (userid) {
		function searchKey(uid) {
			return "friends:" + uid + ":search";
		}

		var mySearch = makeSearch(searchKey(userid));

		this.addUser = function (id, name) {
			mySearch.index(name, id);
		};

		this.updateOwn = function (friends, name) {
			var i;
			for (i = 0; i < friends.length; i += 1) {
				makeSearch(searchKey(friends[i]))
					.index(name, userid);
			}
		};

		this.findFriend = function (query, cb) {
			mySearch.type("and").query(query, cb);
		};
	}
};

module.exports = search;