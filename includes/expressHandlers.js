module.exports = function (express) {
	"use strict";
	var bodyParser = require("body-parser");
	var step = require("step");
	var h = require("whispeerHelper");
	var mailer = require("./mailer");

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

	express.get("/b2b", function (req, res, next) {
		res.send("<form method='POST'><input type='text' name='mail'></form>");
		next();
	});
};
