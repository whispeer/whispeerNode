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

const log = (val) => console.log(val); //eslint-disable-line no-console

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
	"type": "text",
	"fields": {
		"simple": {
			"type": "text",
			"analyzer": "simple"
		},
		"metaphone": {
			"type": "text",
			"analyzer": "metaphone"
		},
		"ngram": {
			"type": "text",
			"analyzer": "edgeNGram"
		},
		"porter": {
			"type": "text",
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
				return Bluebird.resolve().nodeify(cb);
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

const indexAllUsers = () => {
	return getAllUsers()
		.map((user) => getUserNamesAndFriends(user))
		.map((user) =>
			elasticClient.index({
				"index": "whispeer",
				"type": "user",
				"id": user.id,
				"body": user.names
			})
		, { concurrency: 5 })
}

function addNamesToElastic(cb) {
	return Bluebird.coroutine(function * () {
		const exists = yield elasticClient.indices.exists({index: "whispeer" })

		if (exists) {
			log("Delete old index!")
			yield elasticClient.indices.delete({index: "whispeer"})
		}

		log("Change Replica Settings");
		yield elasticClient.indices.putTemplate({
			name: "template",
			body: {
				"template": "*",
				"settings": {
					"number_of_shards": 1,
					"number_of_replicas": 0
				},
			}
		})
		yield elasticClient.cluster.health({ waitForStatus: "green" })

		log("Create Index!")
		yield elasticClient.indices.create({ index: "whispeer" })
		yield elasticClient.cluster.health()
		yield elasticClient.cluster.health({ waitForStatus: "green" })
		log("Settup Settings!")
		yield elasticClient.indices.close({ index: "whispeer" })
		yield elasticClient.indices.putSettings(indexSettings)
		yield elasticClient.cluster.health({ waitForStatus: "green" })
		log("Setup Mappings!")
		yield elasticClient.indices.putMapping(mapping)
		yield elasticClient.indices.open({ index: "whispeer" })

		log("Index creation done - adding users!")

		return indexAllUsers()
	})().nodeify(cb);
}

module.exports = addNamesToElastic;
