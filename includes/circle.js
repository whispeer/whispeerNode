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
		content
		meta
	}

*/

var Circle = function (userid, id) {
	var domain = "user:" + userid + ":circle:" + id;
	this.getData = function getDataF(request, cb) {
		var result = {};
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.hgetall(domain + ":content", this.parallel());
			client.hgetall(domain + ":meta", this.parallel());
		}), h.sF(function (content, meta) {
			meta.users = JSON.parse(meta.users);

			result.id = id;
			result.content = content;
			result.meta = meta;

			request.addKey(meta.circleKey, this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	};

	this.remove = function (request, cb) {
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			client.hget(domain + ":meta", "circleKey", this);
		}), h.sF(function (circleKey) {
			KeyApi.removeKey(request, circleKey, this);
		}), h.sF(function () {
			client.multi()
				.srem("user:" + userid + ":circle", id)
				.sadd("user:" + userid + ":circle:deleted", id)
				.exec(this);
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	};

	function createKeysAndDecryptors(request, key, decryptors, cb) {
		step(function () {
			client.hget(domain + ":meta", "circleKey", this);
		}, h.sF(function (oldKeyID) {
			this.parallel.unflatten();

			KeyApi.get(oldKeyID, this.parallel());
			if (key) {
				SymKey.createWDecryptors(request, key, this.parallel());
			}
		}), h.sF(function (oldKey) {
			oldKey.addDecryptors(request, decryptors, this.parallel());
		}), cb);
	}

	this.update = function (request, content, meta, key, decryptors, cb) {
		var usersRemoved;
		step(function () {
			request.session.ownUserError(userid, this);
		}, h.sF(function () {
			this.parallel.unflatten();
			client.hget(domain + ":meta", "users", this.parallel());
			client.hget(domain + ":meta", "circleKey", this.parallel());
		}), h.sF(function (users, oldKey) {
			users = JSON.parse(users);

			usersRemoved = h.arraySubtract(users, meta.users);
			var removing = usersRemoved.length > 0;

			if (removing && !key) {
				throw new Error("no new key created for circle update even though users were removed!");
			}

			if (!removing && key) {
				throw new Error("new key created for circle update even though no users were removed!");
			}

			if (!decryptors) {
				throw new Error("we need new decryptors!");
			}

			usersRemoved.forEach(function (userid) {
				KeyApi.removeKeyDecryptorForUser(request, oldKey, userid, this.parallel());
			}, this);
			this.parallel()();
		}), h.sF(function () {
			createKeysAndDecryptors(request, key, decryptors, this.parallel());
		}), h.sF(function () {
			var multi = client.multi();
			meta.users = JSON.stringify(meta.users);

			multi.del(domain + ":content");
			multi.del(domain + ":meta");
			multi.hmset(domain + ":content", content);
			multi.hmset(domain + ":meta", meta);

			multi.exec(this.parallel());
		}), h.sF(function () {
			this.ne(true);
		}), cb);
	};
};

Circle.get = function (request, circleid, cb) {
	step(function () {
		client.exists("user:" + request.session.getUserID() + ":circle:" + circleid + ":content", this);
	}, h.sF(function (exists) {
		if (exists === 1) {
			this.ne(new Circle(request.session.getUserID(), circleid));
		} else {
			throw new CircleNotExisting();
		}
	}), cb);
};

Circle.all = function (request, cb) {
	step(function () {
		client.smembers("user:" + request.session.getUserID() + ":circle", this);
	}, h.sF(function (circles) {
		this.ne(circles.map(function (circle) {
			return new Circle(request.session.getUserID(), circle);
		}));
	}), cb);
};

Circle.create = function (request, data, cb) {
	var theCircleID, userid = request.session.getUserID();

	var content = data.content, meta = data.meta;
	step(function () {
		var err = validator.validate("circle", data);

		if (err) {
			throw new InvalidCircleData();
		}

		if (meta.users.length !== data.key.decryptors.length - 1) {
			throw new InvalidCircleData("not enough decryptors");
		}

		meta.users.forEach(function (uid) {
			User.getUser(uid, this.parallel());
		}, this);

		this.parallel()();
	}, h.sF(function () {
		SymKey.createWDecryptors(request, data.key, this);
	}), h.sF(function () {
		client.incr("user:" + userid + ":circle:count", this);
	}), h.sF(function (circleid) {
		theCircleID = circleid;

		var domain = "user:" + userid;

		var multi = client.multi();

		meta.users = JSON.stringify(meta.users);

		multi.sadd(domain + ":circle", circleid);
		multi.hmset(domain + ":circle:" + circleid + ":content", content);
		multi.hmset(domain + ":circle:" + circleid + ":meta", meta);

		multi.exec(this);
	}), h.sF(function () {
		this.ne(new Circle(request.session.getUserID(), theCircleID));
	}), cb);
};

module.exports = Circle;
