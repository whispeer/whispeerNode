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

global.view = {
	logedinError: function (cb) { cb(); },
	getUserID: function () { return -1; }
};

global.printDebug = function () {
	console.log(arguments);
};

repl.start({useGlobal: true});