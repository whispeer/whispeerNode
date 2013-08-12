var rs = require("redis-search");

var search = rs.createSearch({
	// The name of your service. used for namespacing. Default 'search'.
	service : "",
	// The name of this search. used for namespacing. So that you may have several searches in the same db. Default 'ngram'.
	key : "user"
});

module.exports = search;