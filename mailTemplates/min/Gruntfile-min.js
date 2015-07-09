"use strict";

var grunt = require("grunt");

grunt.loadNpmTasks("grunt-contrib-less");
grunt.loadNpmTasks('grunt-jekyll');
grunt.loadNpmTasks('grunt-email-builder');

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
	},
	jekyll: {
		dist: {}
	},
	emailBuilder: {
		mails: {
			files: [{
				expand: true,
				cwd: "_site/",
				src: "**/*.html",
				dest: "_build/"
			}],
			options: {
				encodeSpecialChars: true
			}
		}
	}
});

grunt.registerTask("default", ["less", "jekyll", "emailBuilder"]);

