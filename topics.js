"use strict";

var step = require("step");
var h = require("whispeerHelper");

var verifySecuredMeta = require("./includes/verifyObject");

var user = require("./topics/tuser");
var session = require("./topics/tsession");
var messages = require("./topics/tmessage");
var friends = require("./topics/tfriends");
var circles = require("./topics/tcircles");
var posts = require("./topics/tposts");
var invites = require("./topics/tinvites");
var blob = require("./topics/tblob");
var recovery = require("./topics/trecovery");

var KeyApi = require("./includes/crypto/KeyApi");
var settings = require("./includes/settings");
var mailer = require("./includes/mailer");

var SimpleUserDataStore = require("./includes/SimpleUserDataStore");

var MAXDEPTH = 20;

var signatureCache = new SimpleUserDataStore("signatureCache");
var trustManager = new SimpleUserDataStore("trustManager");
var settings = new SimpleUserDataStore("settings");

var client = require("./includes/redisClient");

settings.preSet(function (request, newContent, cb) {
	step(function () {
		verifySecuredMeta(request, newContent.meta, "settings", this);
	}, cb);
});

trustManager.preSet(function (request, newContent, cb) {
	step(function () {
		trustManager.get(request, this);
	}, h.sF(function (oldTrustManager) {
		if (oldTrustManager) {
			var diff = h.arraySubtract(Object.keys(oldTrustManager), Object.keys(newContent));
			if (diff.length > 0) {
				throw new Error("trust manager update blocked because it would delete data " + diff);
			}
		}

		verifySecuredMeta(request, newContent, "trustManager", this);
	}), cb);
});

//change api style:
//extract objects with methods:
//get
//getMultiple
//create
//delete
//exists
//more actions (e.g. verify)
//seperate message, topic
//seperate timeline, post
//more crud

var pushAPI = require("./includes/pushAPI");

var whispeerAPI = {
	blob: blob,
	invites: invites,
	recovery: recovery,
	pushNotification: {
		subscribe: function (data, fn, request) {
			step(function () {
				if (data.type !== "android" && data.type !== "ios") {
					fn.error.protocol("invalid type");
					this.last.ne();
				}

				pushAPI.subscribe(request, data.type, data.token, this);
			}, h.sF(function () {
				this.ne({
					success: true
				});
			}), fn);
		}
	},
	preRegisterID: function (data, fn, request) {
		step(function () {
			var id = data.id;

			client.multi()
				.sadd("analytics:registration:ids", id)
				.hmset("analytics:registration:id:" + id, {
					added: new Date().getTime()
				})
				.sadd("analytics:registration:id:" + id + ":ips", request.getShortIP())
				.exec(this);
		}, h.sF(function () {
			this.ne({});
		}), fn);
	},
	errors: function (data, fn) {
		step(function () {
			mailer.mailAdmin("User reported an error!", JSON.stringify(data), this);
		}, h.sF(function () {
			this.ne();
		}), fn);
	},
	verifyMail: function verifyMailF(data, fn) {
		step(function () {
			mailer.verifyUserMail(data.challenge, data.mailsEnabled, this);
		}, h.sF(function (success) {
			this.ne({
				mailVerified: success
			});
		}), fn);
	},
	logedin: function isLogedinF(data, fn, request) {
		step(function () {
			if (data === true) {
				request.session.logedin(this);
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (logedin) {
			this.ne(logedin);
		}), fn);
	},
	ping: function (data, fn) {
		step(function () {
			this.ne({
				pong: true
			});
		}, fn);
	},
	key: {
		getMultiple: function (data, fn, request) {
			step(function () {
				if (data.realids.length === 0) {
					this.last.ne();
				}

				data.realids.forEach(function (e) {
					request.addKey(e, this.parallel());
				}, this);
			}, fn);
		},
		get: function getKeyChainF(data, fn, request) {
			var theKey, result = [];
			step(function () {
				KeyApi.get(data.realid, this);
			}, h.sF(function (key) {
				if (!key) {
					throw "could not load key:" + data.realid;
				}

				theKey = key;
				theKey.getAllAccessedParents(request, this, MAXDEPTH);
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
					result[i].getKData(request, this.parallel(), true);
				}
			}), h.sF(function (keys) {
				this.ne({keychain: keys});
			}), fn);
		},
		addFasterDecryptors: function addFasterDecryptorF(data, fn, request) {
			var keys;
			step(function () {
				var key;
				for (key in data.keys) {
					if (data.keys.hasOwnProperty(key)) {
						KeyApi.get(key, this.parallel());
					}
				}
			}, h.sF(function (k) {
				keys = k;

				keys.forEach(function (key) {
					key.addFasterDecryptor(request, data.keys[key.getRealID()][0], this.parallel());
				}, this);
			}), h.sF(function (success) {
				var result = {}, i;

				for (i = 0; i < success.length; i += 1) {
					result[keys[i].getRealID()] = success[i];
				}

				this.ne({
					result: result
				});
			}), fn);
		}
	},
	signatureCache: {
		get: signatureCache.apiGet.bind(signatureCache),
		set: signatureCache.apiSet.bind(signatureCache)
	},
	trustManager: {
		get: trustManager.apiGet.bind(trustManager),
		set: trustManager.apiSet.bind(trustManager),
	},
	settings: {
		getSettings: function (data, fn, request) {
			settings.get(request, h.objectifyResult("settings", fn));
		},
		setSettings: function (data, fn, request) {
			settings.set(request, data.settings, h.objectifyResult("success", fn));
		}
	},
	circle: circles,
	friends: friends,
	messages: messages,
	user: user,
	session: session,
	posts: posts,
	nicknameFree: function isNickNameFree(data, fn) {
		step(function () {
			if (data && data.nickname) {
				if (h.isNickname(data.nickname)) {
					var User = require("./includes/user");
					User.isNicknameFree(data.nickname, this);
				} else {
					this.last.ne({
						nicknameUsed: true
					});
				}
			} else {
				fn.error.protocol();
			}
		}, h.sF(function (free) {
			this.ne({
				nicknameUsed: !free
			});
		}), fn);
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

whispeerAPI.preRegisterID.noLoginNeeded = true;
whispeerAPI.ping.noLoginNeeded = true;
whispeerAPI.nicknameFree.noLoginNeeded = true;
whispeerAPI.mailFree.noLoginNeeded = true;
whispeerAPI.logedin.noLoginNeeded = true;
whispeerAPI.verifyMail.noLoginNeeded = true;
whispeerAPI.errors.noLoginNeeded = true;

module.exports = whispeerAPI;
