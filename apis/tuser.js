"use strict"

/* @refactor */

const h = require("whispeerHelper")
const Bluebird = require("bluebird")

const Topic = require("../includes/topic.js")
const User = require("../includes/user")
const mailer = require("../includes/mailer")
const errorService = require("../includes/errorService")

const userInfo = (request, id) => {
	return User.getUser(id, null, true)
		.then((user) => {
			if (user instanceof UserNotExisting) {
				return user
			}

			return user.getUData(request)
		})
}

function makeSearchUserData(request, ids, known = []) {
	const LIMIT = 10
	const remaining = Math.max(ids.length - LIMIT, 0)


	const knownIDs = known.map(h.parseDecimal)
	const limitedIDs = ids.map(h.parseDecimal).slice(0, LIMIT)

	return Bluebird.all(
		limitedIDs.map((id) => knownIDs.indexOf(id) === -1 ? userInfo(id) : id)
	)
		.then((theUsers = []) => theUsers.filter((user) => !(user instanceof UserNotExisting)))
		.then((results) => ({ remaining, results }))
}

var u = {
	get: function (data, fn, request) {
		return User.getUser(data.identifier || data.id)
			.then((user) => user.getUData(request))
			.catch(UserNotExisting, () => fn.error({userNotExisting: true}))
	},
	searchFriends: function (data, fn, request) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.searchFriends(request, data.text))
			.then((ids) => makeSearchUserData(request, ids, data.known))
			.nodeify(fn)
		//TODO
	},
	changePassword: function (data, fn, request) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.changePassword(request, data.password, data.signedOwnKeys, data.decryptor))
			.then(() => ({}))
			.nodeify(fn)
	},
	search: function searchF(data, fn, request) {
		return User.search(data.text)
			.then((ids) => makeSearchUserData(request, ids, data.known))
			.nodeify(fn)
	},
	backupKey: function (data, fn, request) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.addBackupKey(request, data.decryptors, data.innerKey))
			.then(() => ({}))
			.nodeify(fn)
	},
	getMultiple: function getAllF(data, fn, request) {
		const getUserInfo = (id) =>
			User.getUser(id, null, true)
				.then((user) => {
					if (user instanceof UserNotExisting) {
						errorService.handleError(user, request)
						return user
					}

					return user.getUData(request)
				})

		return data.identifiers
			.map((id) => getUserInfo(id))
			.then((users) => ({ users }))
			.nodeify(fn)
	},
	profile: {
		update: function (data, fn, request) {
			return request.session.getOwnUser()
				.then((ownUser) => ownUser.deletePrivateProfilesExceptMine(request).thenReturn(ownUser))
				.then((ownUser) =>
					Bluebird.all([
						ownUser.setMyProfile(request, data.me),
						ownUser.setPublicProfile(request, data.pub),
						data.priv.map((profile) => ownUser.createPrivateProfile(request, profile))
					])
				)
				.then(() =>({}))
				.nodeify(fn)
		}
	},
	setMigrationState: function (data, fn, request) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.setMigrationState(request, data.migrationState))
			.then(() => ({ success: true }))
			.nodeify(fn)
	},
	mailChange: function (data, fn, request) {
		return request.session.getOwnUser()
			.then((ownUser) => ownUser.setMail(request, data.mail).thenReturn(ownUser))
			.then((ownUser) => mailer.sendAcceptMail(ownUser))
			.then(() => ({}))
			.nodeify(fn)
	},
	donated: function (data, fn, request) {
		return request.session.getOwnUser(this)
			.then((ownUser) => ownUser.donated(request))
			.then(() => ({}))
			.nodeify(fn)
	},
	own: function getOwnDataF(data, fn, request) {
		return Bluebird.coroutine(function *() {
			const ownUser = yield request.session.getOwnUser()

			const userData = yield ownUser.getUData(request)
			const unreadCount = yield Topic.unreadCount(request)

			userData.unreadTopics = unreadCount
			return userData
		}).nodeify(fn)
	}
}

module.exports = u
