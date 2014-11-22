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

global.viewStub = {
	logedinError: function (cb) { cb(); },
	getUserID: function () { return -1; }
};

global.printDebug = function () {
	console.log(arguments);
};

var configManager = require("./includes/configManager");
var config = configManager.get();
var client = require("./includes/redisClient");

client.select(config.dbNumber || 0, function (e) {
	if (e) {
		throw e;
	}
	console.log("Database selected: " + config.dbNumber || 0);


	repl.start({useGlobal: true});
});
