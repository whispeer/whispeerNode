"use strict";
var assert = require("assert");

require("../modules/logger.js").logger.logLevel = 3;

var step = require("step");

describe('Step', function () {
	var Step = require("step");
	var fs = require('fs');
	it('callbackTest', function (done) {
		var selfText = fs.readFileSync(__filename, 'utf8');

		step(
			function readSelf() {
				fs.readFile(__filename, 'utf8', this);
			},
			function capitalize(err, text) {
				if (err) {
					throw err;
				}

				assert.equal(selfText, text, "Text Loaded");
				return text.toUpperCase();
			},
			function showIt(err, newText) {
				if (err) {
					throw err;
				}

				assert.equal(selfText.toUpperCase(), newText, "Text Uppercased");

				done();
			}
		);
	});

	it('error Passing Test', function (done) {
		var exception = new Error('Catch me!');

		step(
			function () {
				var callback = this;
				setTimeout(function () {
					callback(exception);
				}, 0);
			},
			function (err) {
				assert.equal(exception, err, "error should passed through");
				throw exception;
			},
			function (err) {
				assert.equal(exception, err, "error should be caught and passed");
				done();
			}
		);
	});

	it('fn Test', function (done) {
		var myfn = Step.fn(
			function (name) {
				fs.readFile(name, 'utf8', this);
			},
			function capitalize(err, text) {
				if (err) {
					throw err;
				}

				return text.toUpperCase();
			}
		);

		var selfText = fs.readFileSync(__filename, 'utf8');

		myfn(__filename, function (err, result) {
			if (err) {
				throw err;
			}

			assert.equal(selfText.toUpperCase(), result, "It should work");
			done();
		});
	});

	it('parallel step with files', function (done) {
		var selfText = fs.readFileSync(__filename, 'utf8'),
			etcText = fs.readFileSync('./testFile.txt', 'utf8');

		step(
			// Loads two files in parallel
			function loadStuff() {
				fs.readFile(__filename, this.parallel());
				fs.readFile("./testFile.txt", this.parallel());
			},
			// Show the result when done
			function showStuff(err, result) {
				if (err) {
					throw err;
				}

				assert.equal(selfText, result[0], "Code should come first");
				assert.equal(etcText, result[1], "Users should come second");

				done();
			}
		);
	});

	it('parallel step with paralell calls', function (done) {
		// Test lock functionality with N parallel calls
		step(
			function () {
				return 1;
			},
			function makeParallelCalls(err, num) {
				if (err) {
					throw err;
				}

				assert.equal(num, 1);

				setTimeout((function (callback) { return function () { callback(null, 1, 4); }; })(this.parallel()), 100);
				this.parallel()(null, 2, 5);
				setTimeout((function (callback) { return function () { callback(null, 3, 6); }; })(this.parallel()), 0);
			},
			function parallelResults(err, result, result2) {
				if (err) {
					throw err;
				}

				assert.deepEqual(result, [1, 2, 3]);
				assert.deepEqual(result2, [4, 5, 6]);

				return 2;
			},
			function terminate(err, result) {
				if (err) {
					throw err;
				}

				assert.equal(result, 2);
				done();
			}
		);
	});

	it('parallel step with  delays', function () {
		// Test lock functionality with parallel calls with delay
		step(
			function parallelCalls() {
				var p1 = this.parallel(), p2 = this.parallel();
				process.nextTick(function () { p1(null, 1, 3); });
				process.nextTick(function () { p2(null, 2, 4); });
			},
			function parallelResults(err, one, two) {
				if (err) {
					throw err;
				}

				assert.deepEqual(one, [1, 2]);
				assert.deepEqual(two, [3, 4]);

				return 666;
			},
			function terminate1(err, num) {
				if (err) {
					throw err;
				}

				assert.equal(num, 666);
				var next = this;
				setTimeout(function () { next(null, 333); }, 50);
			},
			function terminate2(err, num) {
				if (err) {
					throw err;
				}

				assert.equal(num, 333);
				this();
			}
		);
	});
/*
	it('parallel calls with direct returns', function () {
		// Test lock functionality with parallel calls which return immediately
		step(
			function parallelCalls() {
				var p1 = this.parallel(), p2 = this.parallel();
				p1(null, 1);
				p2(null, 2);
			},
			function parallelResults(err, one, two) {
				if(err) throw err;
				fulfill("test4: " + [one, two]);
				return 666;
			},
			function terminate1(err, num) {
				if(err) throw err;
				fulfill("test4 t1: " + num);
				var next = this;
				setTimeout(function() { next(null, 333); }, 50);
			},
			function terminate2(err, num) {
				if(err) throw err;
				fulfill("test4 t2: " + num);
				this();
			}
		);
	});*/
});

//tests for database.js - done
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

			database.exit();

			done();
		});
	});
});

//tests for exceptions.js - done
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

//tests for client.js - done
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
			var testClient = new Client({}, {
				testAction: function (cb, view) {
					assert.equal(view.getData(), "bla");
					assert.equal(view.getHID(), 55);

					view.setValue("k", 55);

					cb();
				}
			});

			testClient.handle(function () {
				assert.equal(testClient.getResponse(55), '{"rid":5,"testAction":{"k":55}}');

				done();
			}, '{"testAction":"bla", "rid": 5}', 55);

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('nested action function should be called correctly to', function (done) {
			var testClient = new Client({}, {
				testTopic: {
					testAction: function (cb, view) {
						assert.equal(view.getData(), "bla");
						assert.equal(view.getHID(), 55);

						view.setValue("k", 55);

						cb();
					}
				}
			});

			testClient.handle(function () {
				assert.equal(testClient.getResponse(55), '{"rid":5,"testTopic":{"testAction":{"k":55}}}');

				done();
			}, '{"testTopic":{"testAction":"bla"}, "rid": 5}', 55);

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('no hid: hid = 0', function (done) {
			var testClient = new Client({}, {
				testAction: function (cb, view) {
					assert.equal(view.getHID(), 0);

					done();
				}
			});

			testClient.handle(function () {}, '{"testAction":"bla"}');

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('buggy handler -> status:0', function (done) {
			require("../modules/logger.js").logger.logLevel = 5;
			var testClient = new Client({}, {
				testAction: function (cb, view) {
					cb(new Error());
				}
			});

			testClient.handle(function () {
				assert.equal(testClient.getResponse(0), '{"status":0}');

				require("../modules/logger.js").logger.logLevel = 3;
				done();
			}, '{"testAction":"bla"}');

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('buggy handler -> status:0 and error', function (done) {
			require("../modules/logger.js").logger.logLevel = 5;
			var testClient = new Client({}, {});

			testClient.handle(function () {
				assert.equal(testClient.getResponse(0), '{"status":0,"invalidjson":1,"error":"invalidjson"}');

				require("../modules/logger.js").logger.logLevel = 3;
				done();
			}, 'sdfs!');

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('invalid action', function (done) {
			require("../modules/logger.js").logger.logLevel = 5;
			var testClient = new Client({}, {});

			testClient.handle(function () {
				assert.equal(testClient.getResponse(0), '{"testAction":false}');

				require("../modules/logger.js").logger.logLevel = 3;
				done();
			}, '{"testAction":"bla"}');

			assert.equal(typeof testClient.getClientID(), "number");
		});

		it('session is a session', function () {
			var testClient = new Client({}, {});
			assert.equal(testClient.getSession() instanceof require("../modules/session.js"), true);
		});
	});

	it('with listener', function (done) {
		var testClient = new Client({}, {}, function (data) {
			assert.equal(data, "testData");

			testClient.close();

			assert.equal(testClient.canSend(), false);
			assert.throws(function () {
				testClient.send("test");
			});

			done();
		});

		assert.equal(testClient.canSend(), true);

		testClient.send("testData");
	});

	it('without listener', function () {
		var testClient = new Client({}, {});

		assert.equal(testClient.canSend(), false);

		assert.throws(function () {
			testClient.send("testData");
		});
	});
});

//tests for helper.js - done
describe('helper', function () {
	var helper = require("../modules/helper.js").helper;
	helper.log = false;

	describe('code', function () {
		it('length of sid check', function (done) {
			var l = Math.floor(Math.random() * 40) + 1;
			helper.code(l, function (err, d) {
				assert.equal(d.length, l);
				done();
			});
		});

		it('helper code does not throw an error', function (done) {
			var l = Math.floor(Math.random() * 40) + 1;
			helper.code(l, function (err) {
				assert.ifError(err);
				done();
			});
		});

		it('code throws if length < 0', function (done) {
			helper.code(-3, function (err, code) {
				assert.throws(function () {
					assert.ifError(err);
				});
				done();
			});
		});

		it('code throws if length = 0', function (done) {
			helper.code(0, function (err, code) {
				assert.throws(function () {
					assert.ifError(err);
				});
				done();
			});
		});
	});

	describe('passFunction', function () {
		it('just calls next function with arguments', function (done) {
			step(function () {
				this(1, "b");
			}, helper.passFunction, function (a, b) {
				assert.equal(a, 1);
				assert.equal(b, "b");
				done();
			});
		});
	});

	describe('orderCorrectly', function () {
		it('array is ordered correctly', function () {
			var obj = [{"f": function () {return 2; }}, {"f": function () {return 1; }}];
			var order = [1, 2];
			var result = helper.orderCorrectly(obj, order, "f");
			assert.equal(1, result[0].f());
			assert.equal(2, result[1].f());
		});
	});

	describe('hexToBase64', function () {
		it('some standard test vectors', function () {
			var vectors = ["abcdef", "2398", "a7fb"];
			var results = ["q83v", "I5g=", "p/s="];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.hexToBase64(vectors[i]), results[i]);
				assert.equal(helper.hexToBase64(vectors[i].toUpperCase()), results[i]);
			}
		});
	});

	describe('base64ToHex', function () {
		it('some standard test vectors', function () {
			var vectors = ["q83v", "I5g=", "p/s="];
			var results = ["abcdef", "2398", "a7fb"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.base64ToHex(vectors[i]), results[i]);
			}
		});
	});

	describe('isInt', function () {
		it('strings with characters should not be numbers', function () {
			var chars = "abcdefghijklmnopqrstuvwxyz!";

			var i;
			for (i = 0; i < chars.length; i += 1) {
				var k;
				for (k = 5; k < 1000; k += 5) {
					assert.equal(helper.isInt(chars.charAt(i) + k), false);
				}
			}
		});

		it('numbers should be numbers!', function () {
			var i;
			for (i = -1000; i < 50000; i += 7) {
				assert.equal(helper.isInt(i), true);
				assert.equal(helper.isInt("" + i), true);
			}
		});
	});

	describe('isID', function () {
		it('strings with characters should not be ids', function () {
			var chars = "abcdefghijklmnopqrstuvwxyz!-";

			var i;
			for (i = 0; i < chars.length; i += 1) {
				var k;
				for (k = 5; k < 1000; k += 5) {
					assert.equal(helper.isID(chars.charAt(i) + k), false);
				}
			}
		});

		it('positive numbers should be ids!', function () {
			var i;
			for (i = 1; i < 50000; i += 7) {
				assert.equal(helper.isID(i), true);
				assert.equal(helper.isID("" + i), true);
			}
		});

		it('negative numbers should not be ids!', function () {
			var i;
			for (i = -1000; i < 0; i += 7) {
				assert.equal(helper.isID(i), false);
			}
		});
	});

	describe('isNickName', function () {
		it('basic test vectors for a nickname', function () {
			var vectors = ["a", "dfhg", "dfkjbghmsdfbskd", "fuhgvbikuf", "dkfjghlmdfkg", "k98ik9"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isNickname(vectors[i]), true);
			}
		});

		it('basic test vectors for not a nickname', function () {
			var vectors = ["bla@bla", "kuku....", "kazakaz!a", "9wer", "9", ""];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isNickname(vectors[i]), false);
			}
		});
	});

	describe('isMail', function () {
		it('basic test vectors for a mail', function () {
			var vectors = ["bla@blubb.de", "blu@k.de", "k@kk.de", "klakla@blabber.info", "whatsehell@kurt.org", "d@d.d.d.d.de"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isMail(vectors[i]), true);
			}
		});

		it('basic test vectors for not a mail', function () {
			var vectors = ["k", "dfhgskmgh", "kk@kk@kk@kk", "kk@kkk", "kkk@hell.l.l@.de"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isMail(vectors[i]), false);
			}
		});
	});

	describe('isSessionKey', function () {
		it('not a session key vectors', function () {
			var vectors = ["sjdkhagmxfshdgfjahsdgfjkhasgdkjfasdg", "abcdefg", "aaaaaaa", "!slkjdh", "dfigh789", "ioutzwj7erg8", " abjchdbfsdhbg"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isSessionKey(vectors[i]), false);
			}
		});

		it('session key with length 32 vectors', function () {
			var vectors = ["123456789012345678901234567890ab", "12345678901234567890123456789dab", "1334467890123daf789b1c3a567e90ab"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isSessionKey(vectors[i]), true);
			}
		});

		it('session key with length 64 vectors', function () {
			var vectors = ["123456789012345678901234567890ab", "12345678901234567890123456789dab", "1334467890123daf789b1c3a567e90ab"];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				var k;
				for (k = 0; k < vectors.length; k += 1) {
					assert.equal(helper.isSessionKey(vectors[i] + vectors[k]), true);
				}
			}
		});
	});

	describe('isObject', function () {
		it('correct test vectors', function () {
			var vectors = [{}, {a: "b"}, {"k": 5}];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isObject(vectors[i]), true);
			}
		});

		it('wrong test vectors', function () {
			var vectors = ["l", 5, "b", function () {}];

			var i;
			for (i = 0; i < vectors.length; i += 1) {
				assert.equal(helper.isObject(vectors[i]), false);
			}
		});
	});

	describe('step function', function () {
		it('throws given errors', function () {
			assert.throws(function () {
				helper.sF(function () {
					//should never be called.
				})(new Error());
			}, Error);
		});

		it('if no error is given, pass params', function (done) {
			var a = Math.random();

			helper.sF(function (val) {
				assert.equal(val, a);
				done();
			})(undefined, a);
		});
	});

	describe('in array', function () {
		it('not in array', function () {
			assert.equal(helper.inArray([1, 8, 17, 44, 2, 9, 6], 5), false);
		});

		it('in array', function () {
			assert.equal(helper.inArray([1, 8, 17, 44, 2, 9, 6], 2), true);
		});

		it('nothing in empty array', function () {
			var i;
			for (i = 0; i < 1000; i += 1) {
				assert.equal(helper.inArray([], Math.random()), false);
			}
		});
	});

	describe('arraySet', function () {
		it('correct test vectors', function () {
			var a = "name" + Math.random();
			var b = "name" + Math.random();
			var c = "name" + Math.random();
			var d = "name" + Math.random();
			var e = "name" + Math.random();
			var f = "name" + Math.random();

			var obj = {};
			obj[a] = {};
			obj[a][b] = {};
			obj[a][b][c] = {};
			obj[a][b][c][d] = {};
			obj[a][b][c][d][e] = {};
			obj[a][b][c][d][e][f] = {};

			assert.equal(helper.arraySet(obj, a, b, c, d, e, f), true);
		});

		it('wrong test vectors', function () {
			var obj = {};
			assert.equal(helper.arraySet(obj, "b"), false);
			assert.equal(helper.arraySet(), false);
			assert.equal(helper.arraySet({a: {b: {}}}, "a", "b", "c"), false);
		});
	});
});

describe('view', function () {
	var testClient = {
		testAttr: "theTest",
		getSession: function () {
			return {
				testAttr: "testSessionAttr",
				getUserID: function () {
					return 5;
				}
			};
		}
	};

	var View = require("../modules/view.js");
	var view = new View(testClient, "testHID", "testAction", "nN", {testAction: "test"});

	it('getClient', function () {
		assert.equal(view.getClient().testAttr, "theTest");
	});

	it('getSession', function () {
		assert.equal(view.getSession().testAttr, "testSessionAttr");
	});

	it('getUserID', function () {
		assert.equal(view.getUserID(), 5);
	});

	it('getHandle', function () {
		assert.equal(view.getHandle(), "test");
	});
});

describe('doubleLinkedList', function () {
	var Dll = require("../modules/doubleLinkedList.js");

	it('get first and last element of empty list', function () {
		var theList = new Dll();

		assert.equal(theList.getFirst(), null);
		assert.equal(theList.getLast(), null);
		assert.equal(theList.isEmpty(), true);
		assert.equal(theList.length(), 0);
		assert.equal(theList.getNode(2), null);
		assert.equal(theList.getLast(), null);
		assert.equal(theList.getFirst(), null);
	});

	it('add and remove tests', function () {
		var theList = new Dll();

		var node1 = theList.createNode({id: 1}, 1);
		var node2 = theList.createNode({id: 2}, 2);
		var node3 = theList.createNode({id: 3}, 3);
		var node4 = theList.createNode({id: 4}, 4);
		var node5 = theList.createNode({id: 5}, 5);

		theList.addFirst(node1);
		theList.addAfter(node1, node2);

		node2.append(node3);

		theList.addLast(node5);
		node5.prepend(node4);

		assert.equal(theList.getFirst().id(), node1.id());
		assert.equal(theList.getNode(0).id(), node1.id());
		assert.equal(theList.getNode(1).id(), node2.id());
		assert.equal(theList.getNode(2).id(), node3.id());
		assert.equal(theList.getNode(3).id(), node4.id());
		assert.equal(theList.getNode(4).id(), node5.id());

		assert.equal(theList.getFirst().obj().id, node1.id());
		assert.equal(theList.getNode(0).obj().id, node1.id());
		assert.equal(theList.getNode(1).obj().id, node2.id());
		assert.equal(theList.getNode(2).obj().id, node3.id());
		assert.equal(theList.getNode(3).obj().id, node4.id());
		assert.equal(theList.getNode(4).obj().id, node5.id());

		assert.equal(theList.getNode(5), null);
		assert.equal(theList.getLast().id(), node5.id());

		assert.equal(theList.length(), 5);

		theList.remove(node2);

		assert.equal(theList.length(), 4);
		assert.equal(theList.getNode(1).id(), node3.id());

		node1.remove();

		assert.equal(theList.length(), 3);
		assert.equal(theList.getFirst().id(), node3.id());

		node3.remove();
		node4.remove();
		node5.remove();

		assert.equal(theList.length(), 0);
		assert.equal(theList.getFirst(), null);
	});

	it('destructive actions should throw', function () {
		var theList = new Dll();
		var theList2 = new Dll();

		var node1 = theList.createNode({id: 1}, 1);
		var node2 = theList.createNode({id: 2}, 2);
		var node3 = theList.createNode({id: 3}, 3);
		var node4 = theList.createNode({id: 4}, 4);
		var node5 = theList.createNode({id: 5}, 5);

		assert.throws(function () {
			theList2.addFirst(node1);
		});

		theList.addLast(node5);
		theList.addFirst(node4);
		theList.addFirst(node3);
		theList.addFirst(node2);
		theList.addFirst(node1);

		assert.throws(function () {
			theList.addFirst(node5);
		});

		assert.throws(function () {
			theList.addLast(node1);
		});

		assert.throws(function () {
			theList.addLast("bla");
		});
	});

	it('moving nodes', function () {
		var theList = new Dll();
		var theList2 = new Dll();

		var node1 = theList.createNode({id: 1}, 1);
		var node2 = theList.createNode({id: 2}, 2);
		var node3 = theList.createNode({id: 3}, 3);
		var node4 = theList.createNode({id: 4}, 4);
		var node5 = theList.createNode({id: 5}, 5);
		var node6 = theList.createNode({id: 6}, 6);

		theList.addFirst(node5);
		theList.addFirst(node4);
		theList.addFirst(node3);
		theList.addFirst(node2);
		theList.addFirst(node1);

		theList.moveFirst(node5);
		theList.moveLast(node1);

		assert.equal(theList.getFirst().id(), node5.id());
		assert.equal(theList.getLast().id(), node1.id());

		//move should also work with elements not in list.
		theList.moveFirst(node6);
		assert.equal(theList.getFirst().id(), node6.id());
	});

	it('time tests', function () {
		var theList = new Dll();

		var t = new Date().getTime();
		var node1 = theList.createNode({id: 1}, 1);
		assert.ok(node1.getTime() - t < 4);

		t = new Date().getTime();
		node1.updateTime();
		assert.ok(node1.getTime() - t < 4);
	});
});

describe('timeArray', function () {
	var TimeArray = require("../modules/timeArray.js");

	it('add some elements and check if they are there', function () {
		var timedArray = new TimeArray(1000);

		timedArray.add("Test", 4);
		timedArray.add("Hallo", 5);
		timedArray.add("Bla", 7);

		assert.equal(timedArray.get(4), "Test");
		assert.equal(timedArray.get(5), "Hallo");
		assert.equal(timedArray.get(7), "Bla");
	});

	it('add an element which already exists', function () {
		var timedArray = new TimeArray(1000);

		timedArray.add("Bla", 7);

		assert.throws(function () {
			timedArray.add("bla", 7);
		});
	});

	it('manual check', function (done) {
		var timedArray = new TimeArray(200, false);

		timedArray.add("first", 1);

		setTimeout(function () {
			timedArray.add("second", 2);

			assert.throws(function () {
				timedArray.add("First", 1);
			});

			setTimeout(function () {
				assert.equal(timedArray.get(1), "first");
				assert.equal(timedArray.get(2), "second");

				setTimeout(function () {
					timedArray.check();

					assert.equal(timedArray.has(1), false);
					assert.equal(timedArray.has(2), false);

					done();
				}, 301);
			}, 101);
		}, 100);
	});

	it('automatically remove items', function (done) {
		var timedArray = new TimeArray(200, true);

		timedArray.add("first", 1);

		setTimeout(function () {
			timedArray.add("second", 2);

			assert.throws(function () {
				timedArray.add("First", 1);
			});

			setTimeout(function () {
				assert.equal(timedArray.has(1), false);
				assert.equal(timedArray.has(2), true);
				setTimeout(function () {
					assert.equal(timedArray.has(2), false);
					done();
				}, 320);
			}, 180);
		}, 100);
	});

	it('auto check', function (done) {
		var timedArray = new TimeArray(200, true);

		timedArray.add("first", 1);

		setTimeout(function () {
			timedArray.add("second", 2);

			assert.throws(function () {
				timedArray.add("First", 1);
			});

			timedArray.stopAutoCheck();

			setTimeout(function () {
				assert.equal(timedArray.get(1), "first");
				assert.equal(timedArray.get(2), "second");

				timedArray.autoCheck();

				setTimeout(function () {
					assert.equal(timedArray.get(1), null);
					assert.equal(timedArray.get(2), null);

					done();
				}, 401);
			}, 50);
		}, 100);
	});
});

describe('session', function () {});

describe('messageManager', function () {});

describe('userManager', function () {});