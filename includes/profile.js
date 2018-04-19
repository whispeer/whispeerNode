"use strict"

const KeyApi = require("./crypto/KeyApi")

const client = require("./redisClient")

const Session = require("./session")

const validator = require("whispeerValidations")
const RedisObserver = require("./asset/redisObserver")

const Bluebird = require("bluebird")

const Profile = function (userid, profileid) {
	const domain = "user:" + userid + ":profile:" + profileid

	this.getPData = function (request, cb) {
		return Bluebird.all([
			client.getAsync(domain + ":content"),
			client.hgetallAsync(domain + ":meta"),
		]).then(function (content, meta) {
			const result = {
				content: JSON.parse(content),
				meta: meta,
				profileid: profileid
			}

			return request.addKey(result.meta._key).thenReturn(result)
		}).nodeify(cb)
	}

	this.setData = function (request, data, cb) {
		return request.session
			.ownUserError(userid)
			.then(() => {
				if (!Profile.validate(data)) {
					throw new InvalidProfile()
				}

				const { content, meta } = data

				this.notify("update", data)

				return Bluebird.fromCallback(cb =>
					client.multi()
						.set(domain + ":content", JSON.stringify(content))
						.hmset(domain + ":meta", meta)
						.exec(cb)
				)
			}).nodeify(cb)
	}

	this.getKey = function (request, cb) {
		return request.session.logedinError()
			.then(() => client.hgetAsync(domain + ":meta", "_key"))
			.then((keyRealID) => KeyApi.get(keyRealID))
			.nodeify(cb)
	}

	this.hasAccess = function (request, cb) {
		const theProfile = this

		return Bluebird.coroutine(function *() {
			if (request.session.isMyId(userid)) {
				return true
			}

			const key = yield theProfile.getKey(request)

			if (!key) {
				throw new Error("key not existing")
			}

			return key.hasAccess(request)
		}).nodeify(cb)
	}

	this.remove = function (m) {
		m
			.srem("user:" + userid + ":profiles", profileid)
			.del(domain + ":meta")
			.del(domain + ":content")
	}

	this.getID = function () {
		return profileid
	}

	RedisObserver.call(this, "user: " + userid + ":profile", profileid)
}

const getAllProfiles = (request, userid) =>
	request.session.logedinError()
		.then(() => client.smembersAsync("user:" + userid + ":profiles"))
		.then((profiles) => profiles.map((pid) => new Profile(userid, pid)))

Profile.get = function (request, profileid, cb) {
	const ownID = request.session.getUserID()

	return client
		.sismemberAsync(`user:${ownID}:profiles`, profileid)
		.then((exists) => exists ? new Profile(ownID, profileid) : false)
		.nodeify(cb)
}

Profile.getAccessed = function (request, userid, cb) {
	return getAllProfiles(request, userid)
		.filter((p) => p.hasAccess(request))
		.nodeify(cb)
}

Profile.validate = function (data) {
	const content = data.content, meta = data.meta
	const err = validator.validate("profileEncrypted", content, 1)

	return !err && meta._signature && meta._contentHash && meta._key && meta._version
}

const generateProfileID = (request) =>
	Bluebird.coroutine(function *() {
		const pid = yield Session.code(20)
		const added = yield client.saddAsync("user:" + request.session.getUserID() + ":profiles", pid)

		if (added === 0) {
			return generateProfileID(request)
		}

		return pid
	})

Profile.create = function (request, data, cb) {
	const ownID = request.session.getUserID()

	return Bluebird.coroutine(function *() {
		yield request.session.logedinError()

		if (!Profile.validate(data)) {
			console.error("Profile invalid. not creating!")
			return false
		}

		const key = yield KeyApi.get(data.meta._key)

		if (!key || !key.isSymKey()) {
			throw new NotASymKey()
		}

		const profileID = yield generateProfileID(request)

		const profile = new Profile(ownID, profileID)

		yield profile.setData(request, data)
		return profile
	}).nodeify(cb)
}

Profile.deleteAllExcept = function (request, except, cb) {
	const ownID = request.session.getUserID()

	return getAllProfiles(request, ownID)
		.then(function (profiles) {
			const toDelete = profiles.filter((profile) => profile.getID() !== except)

			if (profiles.length > 0 && toDelete.length !== profiles.length - 1) {
				throw new Error("except is not one of our profiles.")
			}

			if (toDelete.length === 0) {
				return
			}

			const m = client.multi()

			toDelete.forEach((profile) => profile.remove(m))

			return Bluebird.fromCallback(cb => m.exec(cb))
		}).nodeify(cb)
}

module.exports = Profile
