var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
	host: "localhost:9200",
	log: "trace"
});

var Bluebird = require("bluebird");
var User = require("../includes/user");
var Friends = require("../includes/friends");
var	redisClient = require("../includes/redisClient");

var h = require("whispeerHelper");

function requestMock(userID) {
	"use strict";
	return {
		session: {
			logedinError: function (cb) {
				cb();
			},
			getUserID: function () {
				return userID;
			}
		}
	};
}

function getAllUsers() {
	"use strict";
	return redisClient.smembersAsync("user:list").map(function (id) {
		return new User(id);
	});
}

function getUserNamesAndFriends(user) {
	"use strict";

	var mockR = requestMock(user.getID());

	var getNamesPromise = Bluebird.promisify(user.getNames, {
	    context: user
	})(mockR);

	var getFriendsPromise = Bluebird.promisify(Friends.get, {
	    context: Friends
	})(mockR);

	return Bluebird.all([
		getNamesPromise,
		getFriendsPromise
	]).spread(function (names, friends) {
		return {
			id: user.getID(),
			names: {
				firstname: names.firstName || "",
				lastname: names.lastName || "",
				nickname: names.nickname,
				friends: friends.map(h.parseDecimal)
			}
		};
	});
}

function addCommentSortedPosts(cb) {
	"use strict";
	return Bluebird.resolve().then(function () {
		return elasticClient.indices.exists({index: "whispeer" });
	}).then(function (exists) {
		if (exists) {
			return elasticClient.indices.delete({index: "whispeer"});
		}
	}).then(function () {
		return elasticClient.indices.create({ index: "whispeer" });
	}).then(function () {
		return elasticClient.cluster.health({ waitForStatus: "green" });
	}).then(function () {
		return elasticClient.indices.close({ index: "whispeer" });
	}).then(function () {
		return elasticClient.indices.putSettings({
			index: "whispeer",
			body: {
					"analysis": {
						"analyzer": {
							"metaphone": {
									"type": "custom",
									"tokenizer": "standard",
									"filter": [
										"lowercase",
										"my_metaphone"
									]
							},
							"porter": {
									"type": "custom",
									"tokenizer": "standard",
									"filter": [
										"lowercase",
										"porter_stem"
									]
							},
							"edgeNGram": {
									"type": "custom",
									"tokenizer": "name_edge_ngram_tokenizer",
									"filter": [
										"lowercase"
									]
							},
							"index_analyzer": {
								"tokenizer": "standard",
								"filter": [
									"standard",
									"my_delimiter",
									"lowercase",
									"stop",
									"asciifolding",
									"porter_stem",
									"my_metaphone"
								]
							},
							"search_analyzer": {
								"tokenizer": "standard",
								"filter": [
									"standard",
									"my_delimiter",
									"lowercase",
									"stop",
									"asciifolding",
									"porter_stem",
									"my_metaphone"
								]
							}
						},
						"tokenizer": {
							"name_edge_ngram_tokenizer" : {
									"type" : "edgeNGram",
									"min_gram" : "2",
									"max_gram" : "5",
									"token_chars": [ "letter", "digit", "symbol" ]
							},
						},
						"filter": {
							"my_delimiter": {
								"type": "word_delimiter",
								"generate_word_parts": true,
								"catenate_words": false,
								"catenate_numbers": false,
								"catenate_all": false,
								"split_on_case_change": false,
								"preserve_original": false,
								"split_on_numerics": false,
								"stem_english_possessive": false
							},
							"my_metaphone": {
								"type": "phonetic",
								"encoder": "metaphone",
								"replace": false
							}
						}
				}
			}
		});
	}).then(function () {
		return elasticClient.cluster.health({ waitForStatus: "green" });
	}).then(function () {
		var fieldMapping = {
			"type": "multi_field",
			"fields": {
				"simple": {
					"type": "string",
					"analyzer": "simple"
				},
				"metaphone": {
					"type": "string",
					"analyzer": "metaphone"
				},
				"ngram": {
					"type": "string",
					"analyzer": "edgeNGram"
				},
				"porter": {
					"type": "string",
					"analyzer": "porter"
				}
			}
		};

		return elasticClient.indices.putMapping({  
			index: "whispeer",
			type: "user",
			body: {
				properties: {
					"firstname": fieldMapping,
					"lastname": fieldMapping,
					"nickname": fieldMapping
				}
			}
		});
	}).then(function () {
		return elasticClient.indices.open({ index: "whispeer" });
	}).then(function () {
		return getAllUsers();
	}).map(function (user) {
		return getUserNamesAndFriends(user);
	}).map(function (user) {
		return elasticClient.index({
			"index": "whispeer",
			"type": "user",
			"id": user.id,
			"body": user.names
		});
	}, { concurrency: 5 }).nodeify(cb);
}

module.exports = addCommentSortedPosts;
