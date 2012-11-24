"use strict";
var logger = require("./modules/logger.js").logger;
var step = require("step");
var userManager = require("./modules/userManager.js");
var h = require("./modules/helper.js").helper;

var fs = require("fs");
var toInclude = fs.readdirSync("./handler");

/** This is the Whispeer API.
* @result logedin:boolean are you currently logged in?
*/
var whispeerAPI = {};

var i;
for (i = 0; i < toInclude.length; i += 1) {
	if (h.getExtension(toInclude[i]) === ".js") {
		var handlerAddition = require("./handler/" + toInclude[i]);
		whispeerAPI[h.getName(toInclude[i])] = handlerAddition;
	}
}


/*var handle = {};

handle["checkMail"] = handler.helper.checkMail;
handle["checkNickname"] = handler.helper.checkNickname;
handle["checkSession"] = handler.helper.checkSession;

handle["publicKey"] = handler.key.publicKey;
handle["sessionKey"] = handler.key.sessionKey;

handle["friendShip"] = handler.user.friendShip;
handle["friends"] = handler.user.friends;
handle["friendShipRequests"] = handler.user.friendShipRequests;
handle["friendShipRequested"] = handler.user.friendShipRequested;

handle["search"] = handler.user.search;

handle["sendMessage"] = handler.messages.sendMessage;
handle["messages"] = handler.messages.handler;

handle["userProfile"] = handler.user.userProfile;
handle["setPublicProfile"] = handler.user.setPublicProfile;
handle["setPrivateProfile"] = handler.user.setPrivateProfile;

handle["getSymAsymKey"] = handler.getSymAsymKey;
handle["setSymAsymKey"] = handler.key.setSymAsymKey;
handle["setKey"] = handler.key.setKey;*/

exports.handle = whispeerAPI;