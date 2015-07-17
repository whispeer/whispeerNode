#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var h = require("whispeerHelper");
var User = require("../includes/user");

var Bluebird = require("bluebird");

var setupP = Bluebird.promisify(setup);

var settings = require("../includes/settings");
var getUser = Bluebird.promisify(User.getUser, User);
var SimpleUserDataStore = require("../includes/SimpleUserDataStore");
var trustManager = new SimpleUserDataStore("trustManager");

var getOwnSettings = Bluebird.promisify(settings.getOwnSettings, settings);
var getTrustManager = Bluebird.promisify(trustManager.get, trustManager);

var verifySecuredMeta = Bluebird.promisify(require("../includes/verifyObject"));

function verifySettings(request) {
	return getOwnSettings(request).then(function (settings) {
		if (settings.meta) {
			return verifySecuredMeta(request, settings.meta, "settings");
		}
	}).catch(function () {
		console.log("Broken settings: " + request.session.getUserID());
	});
}

function verifyTrustManager(request) {
	return getTrustManager(request).then(function (trustManager) {
		if (!trustManager) {
			console.log("no trustmanager set for user: " + request.session.getUserID());
			return;
		}

		return verifySecuredMeta(request, trustManager, "trustManager");
	}).catch(function () {
		console.log("Broken trustManager: " + request.session.getUserID());
	});
}

function verifyUser(userID) {
	var requestStub = {
		session: {
			logedinError: function (cb) { cb(); },
			getUserID: function () { return h.parseDecimal(userID); }
		}
	};

	return getUser(userID).then(function (theUser) {
		return Bluebird.all([
			verifySettings(requestStub, theUser),
			verifyTrustManager(requestStub, theUser)
		]);
		//get settings
		//get trustManager
		//get signedKeys
	});
}


setupP().then(function () {
	return client.smembersAsync("user:list");
}).map(function (userID) {
	return verifyUser(userID);
}).then(function () {
	process.exit();
});
