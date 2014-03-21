var step = require("step");
var h = require("whispeerHelper");

var HandlerCallback = require("./includes/handlerCallback");
var listener = require("./includes/listener");
var topics = require("./topics.js");

var View = require("./includes/view");
var Session = require("./includes/session");
var extend = require("xtend");

module.exports = function (socket) {
	console.log("connection received");
	var session = new Session();

	var myView = new View(socket, session, listener);

	function handlePriorized(count, handler, data, view, cb) {
		var resultMain;
		var p = handler.priorized;

		step(function hp1() {
			if (typeof p !== "object" || !(p instanceof Array) || !p[count]) {
				this.last.ne({});
			} else if (data[p[count]]) {
				if (typeof handler[p[count]] === "function") {
					handler[p[count]](data[p[count]], new HandlerCallback(this.ne), view);
				} else {
					throw "can not priorize a branch yet.";
				}
			} else {
				handlePriorized(count + 1, handler, data, view, cb);
			}
		}, h.sF(function hp2(result) {
			resultMain = result;

			handlePriorized(count + 1, handler, data, view, this);
		}), h.sF(function hp3(result) {
			result[p[count]] = resultMain;

			this.ne(result);
		}), cb);
	}

	function handle(handler, data, fn, view) {
		var topics = [], prioRes = {};
		console.log("Handling:");
		console.log(data);
		step(function () {
			handlePriorized(0, handler, data, view, this);
		}, h.sF(function (priorizedResults) {
			prioRes = priorizedResults;
			if (typeof handler === "function") {
				handler(data, new HandlerCallback(this.last.ne), view);
			} else if (typeof handler === "object" && typeof data === "object") {
				var topic;
				for (topic in data) {
					if (data.hasOwnProperty(topic) && handler[topic] !== undefined) {
						if (!handler.priorized || handler.priorized.indexOf(topic) === -1) {
							topics.push(topic);
							handle(handler[topic], data[topic], this.parallel(), view);
						}
					}
				}
			}
		}), function (err, results) {
			var result = {};

			var i;
			for (i = 0; i < results.length; i += 1) {
				result[topics[i]] = results[i];
			}

			result = extend(result, prioRes);

			this.ne(result);
		}, fn);
	}

	/** adds data which is always present.
	* mainly adds login data
	*/
	function always(view, data, fn) {
		step(function () {
			this.parallel.unflatten();
			view.logedin(this.parallel());
			view.recentActivity();
		}, function (e, logedin) {
			if (e) {
				console.error(e);
				data.status = 0;
			}

			if (data.status !== 0) {
				data.status = 1;
			}

			data.logedin = logedin;

			if (logedin) {
				data.sid = view.getSession().getSID();
				data.userid = view.getSession().getUserID();
			}

			this(data);
		}, fn);
	}

	function handleF(handler, channel) {
		return function handleF(data, fn) {
			var time = new Date().getTime();
			step(function () {
				console.log("Received data:");
				console.log(data);

				if (myView.session().getSID() !== data.sid) {
					myView.session().setSID(data.sid, this);
				} else {
					this.ne();
				}
			}, h.sF(function () {
				handle(handler, data, this, myView);
			}), function (e, result) {
				always(myView, result, fn);
				console.log("Request handled after: " + (new Date().getTime() - time) + " (" + channel + ")");
			});
		};
	}

	var topic, subtopic, cur;
	for (topic in topics) {
		if (topics.hasOwnProperty(topic)) {
			cur = topics[topic];
			socket.on(topic, handleF(cur, topic));
			if (typeof cur === "object") {
				for (subtopic in cur) {
					if (cur.hasOwnProperty(subtopic)) {
						socket.on(topic + "." + subtopic, handleF(topics[topic][subtopic], topic + "." + subtopic));
					}
				}
			}
		}
	}

	socket.on("data", handleF(topics, "data"));

	socket.on("error", function () {
		console.error(arguments);
	});

	socket.on("disconnect", function () {
		myView.destroy();
		//unregister listener
		console.log("client disconnected");
	});
}