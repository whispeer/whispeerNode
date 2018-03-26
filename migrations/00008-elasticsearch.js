"use strict";

const elasticsearch = require("elasticsearch");
const elasticClient = new elasticsearch.Client({
	host: "localhost:9200",
	log: "trace"
});

const Bluebird = require("bluebird");
const User = require("../includes/user");
const Friends = require("../includes/friends");
const redisClient = require("../includes/redisClient");

const h = require("whispeerHelper");

const indexSettings = {
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
}

const fieldMapping = {
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
}

const mapping = {
	index: "whispeer",
	type: "user",
	body: {
		properties: {
			"firstname": fieldMapping,
			"lastname": fieldMapping,
			"nickname": fieldMapping
		}
	}
}

function requestMock(userID) {
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

const getAllUsers = () =>
	redisClient.smembersAsync("user:list")
		.map((id) => new User(id))

function getUserNamesAndFriends(user) {
	const mockR = requestMock(user.getID());

	return Bluebird.all([
		user.getNames(mockR),
		Friends.get(mockR),
	]).spread((names, friends) => ({
		id: user.getID(),
		names: {
			firstname: names.firstName || "",
			lastname: names.lastName || "",
			nickname: names.nickname,
			friends: friends.map(h.parseDecimal)
		}
	}));
}

function addNamesToElastic(cb) {
	return Bluebird.resolve()
	.then(() => elasticClient.indices.exists({index: "whispeer" }))
	.then((exists) => exists && elasticClient.indices.delete({index: "whispeer"}))
	.then(() => elasticClient.indices.create({ index: "whispeer" }))
	.then(() => elasticClient.cluster.health({ waitForStatus: "green" }))
	.then(() => elasticClient.indices.close({ index: "whispeer" }))
	.then(() => elasticClient.indices.putSettings(indexSettings))
	.then(() => elasticClient.cluster.health({ waitForStatus: "green" }))
	.then(() => elasticClient.indices.putMapping(mapping))
	.then(() => elasticClient.indices.open({ index: "whispeer" }))
	.then(() => getAllUsers())
	.map((user) => getUserNamesAndFriends(user))
	.map((user) =>
		elasticClient.index({
			"index": "whispeer",
			"type": "user",
			"id": user.id,
			"body": user.names
		})
	, { concurrency: 5 }).nodeify(cb);
}

module.exports = addNamesToElastic;
