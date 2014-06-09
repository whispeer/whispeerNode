var grunt = require("grunt");
grunt.loadNpmTasks('grunt-contrib-jshint');

grunt.initConfig({
	jshint: {
		all: {
			src: ['Gruntfile.js', '*.js', '**/*.js'],
			options: {
				jshintrc: true
			}
		}
	}
});
