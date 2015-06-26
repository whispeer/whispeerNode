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
			res.send(JSON.stringify({
				success: true
			}));
			next();
		}), function (e) {
			console.error(e);
			res.send(JSON.stringify({
				success: false
			}));
			next();
		});
		console.log(JSON.stringify(req.body));
	});

	express.get("/b2b", function (req, res, next) {
		res.send("<form method='POST'><input type='text' name='mail'></form>");
		next();
	});
};
