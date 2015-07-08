"use strict";

var grunt = require("grunt");

grunt.loadNpmTasks("grunt-contrib-less");

grunt.initConfig({
	less: {
		development: {
			options: {
				paths: ["_less"],
				sourceMap: true,
				sourceMapFilename: "assets/css/mail.css.map",
				sourceMapRootpath: "/"
			},
			files: {
				"assets/css/mail.css": "_less/mail.less"
			}
		}
	}
});

grunt.registerTask("default", ["less"]);