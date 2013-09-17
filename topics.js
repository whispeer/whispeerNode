"use strict";

var step = require("step");
var h = require("whispeerHelper");

var user = require("./topics/tuser");
var session = require("./topics/tsession");
var messages = require("./topics/tmessage");
var friends = require("./topics/tfriends");
var circles = require("./topics/tcircles");

var whispeerAPI = {
	priorized: ["keyData"],
	logedin: function isLogedinF(data, fn, view) {
		step(function () {
			if (data === true) {
				view.logedin(this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (logedin) {
			this.ne(logedin);
		}), fn);
	},
	getKeyChain: function getKeyChainF(data, fn, view) {
		var theKey, result = [];
		step(function () {
			var Key = require("./includes/crypto/Key");
			Key.get(data.realid, this);
		}, h.sF(function (key) {
			var MAXDEPTH = 20;

			theKey = key;
			theKey.getAllAccessedParents(view, this, MAXDEPTH);
		}), h.sF(function (parents) {
			var i;
			if (data.loaded && Array.isArray(data.loaded)) {
				for (i = 0; i < parents.length; i += 1) {
					if (data.loaded.indexOf(parents[i].getRealID()) === -1) {
						result.push(parents[i]);
					}
				}
			}

			result.push(theKey);

			for (i = 0; i < result.length; i += 1) {
				result[i].getKData(view, this.parallel(), true);
			}
		}), h.sF(function (keys) {
			this.ne({keychain: keys});
		}), fn);
	},
	circles: circles,
	friends: friends,
	messages: messages,
	user: user,
	session: session,
	nicknameFree: function isNickNameFree(data, fn) {
		step(function () {
			if (data && data.nickname) {
				if (h.isNickname(data.nickname)) {
					var User = require("./includes/user");
					User.getUser(data.nickname, this);
				} else {
					this.last.ne({
						nicknameUsed: true
					});
				}
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e) {
			if (e) {
				this.ne({
					nicknameUsed: false
				});
			} else {
				this.ne({
					nicknameUsed: true
				});
			}
		}, UserNotExisting), fn);
	},
	mailFree: function isMailFree(data, fn) {
		step(function () {
			if (data && data.mail) {
				if (h.isMail(data.mail)) {
					var User = require("./includes/user");
					User.getUser(data.mail, this);
				} else {
					this.last.ne({
						mailUsed: true
					});
				}
			} else {
				fn.error.protocol();
			}
		}, h.hE(function (e) {
			if (e) {
				this.ne({
					mailUsed: false
				});
			} else {
				this.ne({
					mailUsed: true
				});
			}
		}, UserNotExisting), fn);
	}
};

module.exports = whispeerAPI;