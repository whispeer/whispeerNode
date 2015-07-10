module.exports = function (express) {
	"use strict";
	var bodyParser = require("body-parser");
	var step = require("step");
	var h = require("whispeerHelper");
	var mailer = require("./mailer");

	var client = require("./redisClient");

	var path = require("path");

	express.use(bodyParser.urlencoded({ extended: true }));

	express.post("/b2b", function (req, res, next) {
		step(function () {
			mailer.mailAdmin("B2B Request!", JSON.stringify(req.body), this);
		}, h.sF(function () {
			res.send("Thank you! We will handle your request soon! <a href='https://whispeer.de/en/b2b'>Take me back</a>");
			next();
		}), function (e) {
			console.error(e);
			res.send("An error occured. Please send us a mail directly: <a href='mailto:nils@whispeer.de'>nils@whispeer.de</a>");
			next();
		});
		console.log(JSON.stringify(req.body));
	});

	express.get("/pixel/:id.png", function (req, res) {
		client.zadd("analytics:mail:tracked", new Date().getTime(), req.params.id, function (e) {
			if (e) {
				console.error(e);
			}
		});

		var pixelPath = "pixel.png";

		var options = {
			root: path.dirname(require.main.filename),
			dotfiles: "deny",
			headers: {
				"x-timestamp": Date.now(),
				"x-sent": true
			}
		};

		res.sendFile(pixelPath, options, function (err) {
			if (err) {
				console.error(err);
			}
		});
	});

	express.get("/b2b", function (req, res, next) {
		res.send("<form method='POST'><input type='text' name='mail'></form>");
		next();
	});
};
