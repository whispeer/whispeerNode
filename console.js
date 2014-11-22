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

console.log("Database selected: " + config.dbNumber || 0);
client.select(config.dbNumber || 0, function () {
	repl.start({useGlobal: true});
});
