"use strict";

var step = require("step");
var h = require("whispeerHelper");

var validator = require("whispeerValidations");
var client = require("./redisClient");
var KeyApi = require("./crypto/KeyApi");
var User = require("./user");

/*
	circle: {
		key,
		name,
		userids
	}

*/

var Circle = function (userid, id) {
	var domain = "user:" + userid + ":circle:" + id, theCircle = this;
	this.getData = function getDataF(view, cb, key) {
		var result = {};
		step(function () {
			view.ownUserError(userid, this);
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
				KeyApi.getWData(view, result.key, this, true);
			} else {
				this.ne(result.key);
			}
		}), h.sF(function (key) {
			result.key = key;

			this.ne(result);
		}), cb);
	};

	this.getKey = function getKeyF(view, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			client.hget(domain, "key", this);
		}), h.sF(function (keyid) {
			KeyApi.get(keyid, this);
		}), cb);
	};

	this.addUser = function addUserF(view, toAddID, decryptor, cb) {
		//data needs to have:
		//userid
		//and a new decryptor
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			User.getUser(toAddID, this.parallel());
		}), h.sF(function (user) {
			toAddID = user.getID();
			client.sismember(domain + ":user", toAddID, this);
		}), h.sF(function () {
			theCircle.getKey(view, this.parallel());
		}), h.sF(function (key) {
			key.addDecryptor(view, decryptor, this);
		}), h.sF(function () {
			client.sadd(domain + ":user", toAddID, this);
			//todo view.notifyOwnClients("circle", {circleid: id, addUser: {uid: toAddID}})
		}), cb);
	};

	this.hasUser = function hasUserF(view, userid, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			client.sismember(domain + ":user", this);
		}), cb);
	};

	this.getUser = function getUserF(view, cb) {
		step(function () {
			view.ownUserError(userid, this);
		}, h.sF(function () {
			client.smembers(domain + ":user", this);
		}), cb);
	};

	this.removeUser = function removeUserF() {
		//TO-DO
	};
};

Circle.get = function (view, circleid, cb) {
	step(function () {
		client.exists("user:" + view.getUserID() + ":circle:" + circleid, this);
	}, h.sF(function (exists) {
		console.log("test");
		if (exists === 1) {
			this.ne(new Circle(view.getUserID(), circleid));
		} else {
			throw new CircleNotExisting();
		}
	}), cb);
};

Circle.getAll = function (view, cb) {
	step(function () {
		client.smembers("user:" + view.getUserID() + ":circles", this);
	}, h.sF(function (circles) {
		var result = [], i;
		for (i = 0; i < circles.length; i += 1) {
			result.push(new Circle(view.getUserID(), circles[i]));
		}

		this.ne(result);
	}), cb);
};

Circle.create = function (view, data, cb) {
	var SymKey = require("./crypto/symKey");

	var result = {}, theCircleID, userid = view.getUserID();
	step(function () {
		var err = validator.validate("circle", data);

		if (err) {
			throw new InvalidCircleData();
		}

		SymKey.createWDecryptors(view, data.key, this);
	}, h.sF(function (key) {
		result.key = key.getRealID();
		result.name = data.name;

		client.incr("user:" + userid + ":circleCount", this);
	}), h.sF(function (circleid) {
		theCircleID = circleid;

		var domain = "user:" + userid;

		var multi = client.multi();

		multi.sadd(domain + ":circles", circleid);
		multi.hmset(domain + ":circle:" + circleid, result);

		multi.exec(this);
	}), h.sF(function () {
		this.ne(new Circle(view.getUserID(), theCircleID));
	}), cb);
};

module.exports = Circle;