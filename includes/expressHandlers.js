"use strict";

const path = require("path");
const bodyParser = require("body-parser");

const clientError = require("./models/clientErrorModel");

module.exports = function (express) {
	var mailer = require("./mailer");
	var client = require("./redisClient");

	function allowCrossDomain(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
		res.header("Access-Control-Allow-Headers", "Content-Type");

		next();
	}

	express.use(bodyParser.json());
	express.use(allowCrossDomain);

	express.post("/reportError",  function (req, res, next) {
		if (!req.body || !req.body.error) {
			next();
			return;
		}

		clientError.create({
			errorText: req.body.error,
			errorStack: req.body.stack,
			headers: JSON.stringify(req.headers),
			mailSent: false
		}).then(() => {
			res.send("Error Report Transfered");
			next();
		})
	});

	express.post("/b2b", function (req, res, next) {
		return mailer.mailAdmin("B2B Request!", JSON.stringify(req.body)).then(() => {
			res.send("Thank you! We will handle your request soon! <a href='https://whispeer.de/en/b2b'>Take me back</a>");
			next();
		}).catch((e) => {
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
