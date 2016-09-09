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

function generateSearch(field, text) {
	var result = [{
		"q": {
			"query": text,
			"boost": 5
		},
		"sub": "simple"
	}, {
		"q": {
			"query": text,
			"boost": 2,
			"fuzziness": 1
		},
		"sub": "simple"
	}, {
		"q": {
			"query": text,
			"boost": 3
		},
		"sub": "metaphone"
	}, {
		"q": {
			"query": text,
			"boost": 1
		},
		"sub": "porter"
	}, {
		"q": {
			"query": text
		},
		"sub": "ngram"
	}];

	return result.map(function (val) {
		var r = {};
		r[field + (val.sub ? "." + val.sub : "")] = val.q;
		return { match: r };
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
						"bool": {
							"should": generateSearch("firstname", text).concat(
								generateSearch("lastname", text)
							).concat(
								generateSearch("nickname", text)
							)
						}
					}
				}
			}).nodeify(cb);
		},
		searchFriends: function (userID, text, cb) {
			return client.search({
				index: "whispeer",
				type: "user",
				body: {
					query: {
						"bool": {
							"should": generateSearch("firstname", text).concat(
								generateSearch("lastname", text)
							).concat(
								generateSearch("nickname", text)
							),
							"filter": {
								"term": {
									"friends": parseInt(userID, 10)
								}
							}
						}
					}
				}
			}).nodeify(cb);
		}
	}
};

module.exports = search;
