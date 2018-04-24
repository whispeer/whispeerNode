"use strict";

const h = require("whispeerHelper");
const Bluebird = require("bluebird");

const validator = require("whispeerValidations");
const client = require("./redisClient");
const KeyApi = require("./crypto/KeyApi");
const User = require("./user");

const SymKey = require("./crypto/symKey");

/*
	circle: {
		key,
		content
		meta
	}

*/

var Circle = function (userid, id) {
	const domain = `user:${userid}:circle:${id}`;
	this.getData = function getDataF(request, cb) {
		return request.session.ownUserError(userid).then(() =>
			Bluebird.all([
				client.hgetallAsync(domain + ":content"),
				client.hgetallAsync(domain + ":meta"),
			])
		).then(([content, meta]) => {
			meta.users = JSON.parse(meta.users);

			return request.addKey(meta.circleKey)
				.thenReturn({
					id,
					content,
					meta
				});
		})
		.nodeify(cb);
	};

	this.remove = function (request, cb) {
		return request.session.ownUserError(userid)
			.then(() => client.hgetAsync(domain + ":meta", "circleKey"))
			.then((circleKey) => KeyApi.removeKey(request, circleKey))
			.then(() => {
				const multi = client.multi()
					.srem("user:" + userid + ":circle", id)
					.sadd("user:" + userid + ":circle:deleted", id)

				return Bluebird.fromCallback((cb) => multi.exec(cb))
			})
			.then(() => true)
			.nodeify(cb);
	};

	function createKeysAndDecryptors(request, key, decryptors, cb) {
		return client.hgetAsync(domain + ":meta", "circleKey")
			.then((oldKeyID) =>
				Bluebird.all([
						KeyApi.get(oldKeyID),
						key ? SymKey.create(request, key) : null
				])
			)
			.then(([oldKey]) => oldKey.addDecryptors(request, decryptors))
			.thenReturn(true)
			.nodeify(cb)
	}

	this.update = function (request, content, meta, key, decryptors, cb) {
		return request.session.ownUserError(userid).then(() => {
			return Bluebird.all([
				client.hgetAsync(domain + ":meta", "users"),
				client.hgetAsync(domain + ":meta", "circleKey"),
			])
		}).then(([users, oldKey]) => {
			users = JSON.parse(users);

			const usersRemoved = h.arraySubtract(users, meta.users);
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

			return Bluebird.all(usersRemoved.map((userid) => KeyApi.removeKeyDecryptorForUser(request, oldKey, userid)))
		}).then(() =>
			createKeysAndDecryptors(request, key, decryptors)
		).then(() => {
			var multi = client.multi();
			meta.users = JSON.stringify(meta.users);

			multi.del(domain + ":content");
			multi.del(domain + ":meta");
			multi.hmset(domain + ":content", content);
			multi.hmset(domain + ":meta", meta);

			return Bluebird.fromCallback((cb) => multi.exec(cb))
		})
		.then(() => true)
		.nodeify(cb);
	};
};

Circle.get = function (request, circleid, cb) {
	return client.existsAsync(`user:${request.session.getUserID()}:circle:${circleid}:content`)
		.then((exists) => {
			if (exists === 1) {
				return new Circle(request.session.getUserID(), circleid);
			}

			throw new CircleNotExisting();
		}).nodeify(cb);
};

Circle.all = function (request, cb) {
	return client.smembersAsync(`user:${request.session.getUserID()}:circle`)
		.map((circle) => new Circle(request.session.getUserID(), circle))
		.nodeify(cb);
};

Circle.create = function (request, data, cb) {
	var theCircleID, userid = request.session.getUserID();

	var content = data.content, meta = data.meta;
	return Bluebird.try(() => {
		var err = validator.validate("circle", data);

		if (err) {
			throw new InvalidCircleData();
		}

		if (meta.users.length !== data.key.decryptors.length - 1) {
			throw new InvalidCircleData("not enough decryptors");
		}

		return Bluebird.all(meta.users.map((uid) => User.getUser(uid)))
	})
	.then(() => SymKey.create(request, data.key))
	.then(() => client.incrAsync("user:" + userid + ":circle:count"))
	.then((circleid) => {
		theCircleID = circleid;

		var domain = "user:" + userid;

		var multi = client.multi();

		meta.users = JSON.stringify(meta.users);

		multi.sadd(domain + ":circle", circleid);
		multi.hmset(domain + ":circle:" + circleid + ":content", content);
		multi.hmset(domain + ":circle:" + circleid + ":meta", meta);

		return Bluebird.fromCallback((cb) => multi.exec(cb))
	}).then(function () {
		return new Circle(request.session.getUserID(), theCircleID);
	}).nodeify(cb)
};

module.exports = Circle;
