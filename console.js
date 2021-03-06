"use strict";

var repl = require("repl");

var fs = require("fs");

var files = fs.readdirSync("./includes");

files.forEach(function (name) {
	if (name.indexOf(".js") > -1) {
		var moduleName = name.replace(/\.js/, "");
		global[moduleName] = require("./includes/" + moduleName);
	}
});

global.requestStub = {
	session: {
		logedinError: function (cb) { cb(); },
		getUserID: function () { return -1; }
	}
};

global.printDebug = function () {
	console.log(arguments);
};

var configManager = require("./includes/configManager");
var config = configManager.get();
var client = require("./includes/redisClient");

client.select(config.db.number || 0, function (e) {
	if (e) {
		throw e;
	}
	console.log("Database selected: " + config.db.number || 0);


	repl.start({useGlobal: true});
});
