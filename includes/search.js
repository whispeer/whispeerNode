"use strict";
var rs = require("redis-search");

function makeSearch(key) {
	return rs.createSearch({
		service: "",
		key: key
	});
}

var userSearch = makeSearch("user");

var search = {
	user: userSearch,
	friendsSearch: function (view) {
		function join(additor) {
			var i, vals = [];
			for (i = 1; i < arguments.length; i += 1) {
				if (arguments[i]) {
					vals.push(arguments[i]);
				}
			}

			return vals.join(additor);
		}

		function ownID() {
			return view.getUserID();
		}

		function searchKey(uid) {
			return "friends:" + uid + ":search";
		}

		var mySearch = makeSearch(searchKey(ownID()));

		this.addUser = function (id, firstname, lastname, nickname) {
			mySearch.index(join(firstname, lastname, nickname), id);
		};

		this.updateOwn = function (friends, name) {
			var i, ownID = ownID();
			for (i = 0; i < friends.length; i += 1) {
				makeSearch(searchKey(friends[i]))
					.index(name, ownID);
			}
		};

		this.search = function (query, cb) {
			mySearch.type("and").query(query, cb);
		};
	}
};

module.exports = search;