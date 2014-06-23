"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");

var SymKey = require("./crypto/symKey");

/*
	circle: {
		key,
		name,
		userids
	}

*/

var Circle = function (userid, id) {
	var domain = "user:" + userid + ":circle:" + id, theCircle = this;
	this.getData = function getDataF(request, cb, key) {
		var result = {};
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.smembers(domain + ":user", this.parallel());
			client.hgetall(domain, this.parallel());
		}), h.sF(function (user, data) {
			result = data;
			result.user = user;
			result.id = id;
			result.userid = userid;

			if (key) {
				KeyApi.getWData(request, result.key, this, true);
			} else {
				this.ne(result.key);
			}
		}), h.sF(function (key) {
			result.key = key;

			this.ne(result);
		}), cb);
	};

	this.getKey = function getKeyF(request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.hget(domain, "key", this);
		}), h.sF(function (keyid) {
			KeyApi.get(keyid, this);
		}), cb);
	};

	/*this.update = function updateF(request, data, cb) {
		//TODO
	};*/

	this.remove = function removeF(request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.srem("user:" + request.session.getUserID() + ":circles", id, this);
		}), h.sF(function (res) {
			this.ne(res === 1);
		}), cb);
	};

	this.addUsers = function addUsersF(request, toAddIDs, decryptors, cb) {
		//data needs to have:
		//userid
		//and a new decryptor
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			var i;
			for (i = 0; i < toAddIDs.length; i += 1) {
				User.getUser(toAddIDs[i], this.parallel());
			}
		}), h.sF(function (users) {
			var currentStep = this;
			toAddIDs = users.map(function (e) {
				client.sismember(domain + ":user", e.getID(), currentStep.parallel());
				return e.getID();
			});
		}), h.sF(function () {
			theCircle.getKey(request, this);
		}), h.sF(function (key) {
			key.addDecryptors(request, decryptors, this);
		}), h.sF(function () {
			client.sadd(domain + ":user", toAddIDs, this);
			request.socketData.notifyOwnClients("circle", {circleid: id, addUsers: toAddIDs});
		}), cb);
	};

	this.hasUser = function hasUserF(request, userid, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.sismember(domain + ":user", this);
		}), cb);
	};

	this.getUser = function getUserF(request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.smembers(domain + ":user", this);
		}), cb);
	};

	this.remove = function removeCircleF(request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.multi()
				.srem("user:" + userid + ":circles", id)
				.sadd("user:" + userid + ":deletedCircles", id)
				.exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	};

	this.removeUsers = function removeUserF(request, key, oldKeyDecryptor, toKeep, toRemove, cb) {
		var userids, realID;
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			//addBasicData(key, toKeep, this);
			//addDecryptor(key, oldKeyDecryptor);

			var i;
			for (i = 0; i < toKeep.length; i += 1) {
				User.getUser(toKeep[i], this.parallel());
			}

			if (toKeep.length === 0) {
				this.ne([]);
			}
		}), h.sF(function (users) {
			userids = users.map(function (e) {return e.getID();});

			theCircle.getUser(request, this);
		}), h.sF(function (circleUsers) {
			circleUsers = circleUsers.map(h.parseDecimal);

			var i;
			var localUsers = toKeep.concat(toRemove);
			if (circleUsers.length === localUsers.length) {
				for (i = 0; i < localUsers.length; i += 1) {
					if (circleUsers.indexOf(localUsers[i]) === -1) {
						this.last.ne(false);
						return;
					}
				}

				SymKey.createWDecryptors(request, key, this);
			} else {
				this.last.ne(false);
			}
		}), h.sF(function (key) {
			realID = key.getRealID();
			theCircle.getKey(request, this);
		}), h.sF(function (circleKey) {
			circleKey.addDecryptor(request, oldKeyDecryptor, this);
		}), h.sF(function () {
			client.multi()
				.srem(domain + ":user", toRemove)
				.hset(domain, "key", realID)
				.exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	};
};

Circle.get = function (request, circleid, cb) {
	step(function () {
		client.exists("user:" + request.session.getUserID() + ":circle:" + circleid, this);
	}, h.sF(function (exists) {
		if (exists === 1) {
			this.ne(new Circle(request.session.getUserID(), circleid));
		} else {
			throw new CircleNotExisting();
		}
	}), cb);
};

Circle.getAll = function (request, cb) {
	step(function () {
		client.smembers("user:" + request.session.getUserID() + ":circles", this);
	}, h.sF(function (circles) {
		var result = [], i;
		for (i = 0; i < circles.length; i += 1) {
			result.push(new Circle(request.session.getUserID(), circles[i]));
		}

		this.ne(result);
	}), cb);
};

Circle.create = function (request, data, cb) {
	var result = {}, theCircleID, userid = request.session.getUserID(), userids;
	step(function () {
		var err = validator.validate("circle", data);

		if (err) {
			throw new InvalidCircleData();
		}

		if (data.user && data.user.length !== data.key.decryptors.length - 1) {
			throw new InvalidCircleData("not enough decryptors");
		}

		if (data.user && data.user.length > 0) {
			var i;
			for (i = 0; i < data.user.length; i += 1) {
				User.getUser(data.user[i], this.parallel());
			}
		} else {
			this.ne([]);
		}
	}, h.sF(function (users) {
		userids = users.map(function (e) {return e.getID();});

		SymKey.createWDecryptors(request, data.key, this);
	}), h.sF(function (key) {
		result.key = key.getRealID();
		result.name = data.name;

		client.incr("user:" + userid + ":circleCount", this);
	}), h.sF(function (circleid) {
		theCircleID = circleid;

		var domain = "user:" + userid;

		var multi = client.multi();

		multi.sadd(domain + ":circles", circleid);
		multi.hmset(domain + ":circle:" + circleid, result);

		if (userids.length > 0) {
			multi.sadd(domain + ":circle:" + circleid + ":user", userids);
		}

		multi.exec(this);
	}), h.sF(function () {
		this.ne(new Circle(request.session.getUserID(), theCircleID));
	}), cb);
};

module.exports = Circle;