"use strict";
var assert = require("assert");

require("../modules/logger.js").logger.logLevel = 3;

describe('Database', function () {
	var database = require("../modules/database.js");

	it('Basic SQL Statement Test', function (done) {
		database.exec("Select 1 as test", [], function (err, result) {
			assert.ifError(err);

			assert.equal(result.length, 1);
			assert.equal(result[0].test, 1);

			var val;
			for (val in result[0]) {
				if (result[0].hasOwnProperty(val)) {
					assert.equal(val, "test");
				}
			}

			done();
		});
	});
});

describe('Exceptions', function () {
	var exceptions = require("../modules/exceptions.js");

	describe('create', function () {
		var message = "test";
		var testException = function (theException) {
			it("message", function () {
				assert.equal(theException.message, message);
			});

			it("toString", function () {
				assert.equal(typeof theException.toString, "function");
				assert.equal(typeof theException.toString(), "string");
			});
		};

		var Exception;
		for (Exception in exceptions) {
			if (exceptions.hasOwnProperty(Exception)) {
				var theException = new exceptions[Exception](message);

				testException(theException);
			}
		}
	});
});

describe('client', function () {
	var Client = require("../modules/client.js").Client;
	describe('different handler tests', function () {
		it('no request should throw', function () {
			assert.throws(function () {
				var testClient = new Client();
			}, Error);
		});

		it('no handler should throw', function () {
			assert.throws(function () {
				var testClient = new Client({});
			}, Error);
		});

		it('action function should be called with handle data', function (done) {
			//TODO: a lot!
			var testClient = new Client({}, {
				testAction: function (cb, view) {
					assert.equal(view.getData(), "bla");
					assert.equal(view.getHID(), 55);

					cb();
				}
			});

			testClient.handle(function () {
				done();
				//todo
			}, '{"testAction":"bla"}', 55);
		});
		
	});

	describe('with listener', function () {

	});

	describe('without listener', function () {

	});
});

describe('helper', function () {});

describe('logger', function () {});

describe('messageManager', function () {});

describe('server', function () {});

describe('session', function () {});

describe('timeArray', function () {});

describe('userManager', function () {});

describe('view', function () {});