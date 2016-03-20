"use strict";
var client = require("./redisClient");

var elasticsearch = require("elasticsearch");
var client = new elasticsearch.Client({
  host: "localhost:9200",
  log: "trace"
});

function makeSearch(key) {
	return rs.createSearch({
		service: "",
		key: key,
		client: client,
		cache_time: 1
	});
}

var search = {
	user: {
		index: function (userID, userData) {
			return client.index({
				"index": "whispeer",
				"type": "user",
				"id": userID,
				"body": userData
			});
		},
		remove: function (userID) {
			return client.delete({
				"index": "whispeer",
				"type": "user",
				"id": userID
			});
		},
		search: function (text, cb) {
			return client.search({
				index: "whispeer",
				type: "user",
				body: {
					query: {
						"multi_match": {
							"fields":  ["firstname", "lastname", "nickname"],
							"query":     text,
							"fuzziness": "AUTO"
						}
					}
				}
			}, cb);
		}
	},
	friendsSearch: function (userid) {
		function searchKey(uid) {
			return "friends:" + uid + ":search";
		}

		var mySearch = makeSearch(searchKey(userid));

		this.addUser = function (id, name) {
			mySearch.index(name, id);
		};

		this.remove = function (id, cb) {
			mySearch.remove(id, cb);
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
