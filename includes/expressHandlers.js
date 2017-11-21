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

	express.post("/businessTrial", (req, res, next) => {
		if (!req.body || !req.body.sessionID) {
			next()
			return
		}

		const { sessionID } = req.body

		return client.getAsync("session:" + sessionID).then((userID) =>
			client.scardAsync(`user:${userID}:companies`).then((companyCount) => {
				if (companyCount > 0) {
					// eslint-disable-next-line no-console
					console.log(`${userID} is already a business user`)
					return
				}

				const companyID = `trial-${Math.random()}`

				client.saddAsync(`user:${userID}:companies`, companyID).then(() => {
					// eslint-disable-next-line no-console
					console.log(`${userID} started trial with ${companyID} as companyID`)

					return mailer.mailSupport("Business Trial", `${userID} started trial with ${companyID} as companyID`)
				})
			})
		).finally(() => next())
	})

	express.post("/reportError",  function (req, res, next) {
		if (!req.body || !req.body.error) {
			next();
			return;
		}

		/*clientError.create({
			errorText: req.body.error,
			errorStack: req.body.stack,
			headers: JSON.stringify(req.headers),
			mailSent: false
		}).then(() => {*/
			res.send("Error Report Transfered");
			next();
		/*})*/
	});

	express.post("/b2b", function (req, res, next) {
		return mailer.mailAdmin("B2B Request!", JSON.stringify(req.body)).then(() => {
			res.send("Thank you! We will handle your request soon! <a href='https://whispeer.de/en/b2b'>Take me back</a>");
			next();
		}).catch((e) => {
			// eslint-disable-next-line no-console
			console.error(e);
			res.send("An error occured. Please send us a mail directly: <a href='mailto:nils@whispeer.de'>nils@whispeer.de</a>");
			next();
		});
	});

	express.get("/pixel/:id.png", function (req, res) {
		client.zadd("analytics:mail:tracked", new Date().getTime(), req.params.id, function (e) {
			if (e) {
				// eslint-disable-next-line no-console
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
				// eslint-disable-next-line no-console
				console.error(err);
			}
		});
	});

	express.get("/b2b", function (req, res, next) {
		res.send("<form method='POST'><input type='text' name='mail'></form>");
		next();
	});
};
