"use strict"

const code = require("./session").code
const client = require("./redisClient")
const mailer = require("./mailer")
const User = require("./user")

const Bluebird = require("bluebird")

const Notification = require("./notification")

const INVITELENGTH = 10


const escapeHtml = require("escape-html")

const invites = {
	generateCode: function (request, reference, active) {
		return Bluebird.coroutine(function *() {
			yield request.session.logedinError()

			//generate random invite code
			const inviteCode = yield code(INVITELENGTH)

			//add invite code to list of all codes
			const addedCount = yield client.saddAsync("invites:v2:all", inviteCode)

			if (addedCount !== 1) {
				return invites.generateCode(request, reference, active)
			}

			const userid = request.session.getUserID()

			yield Bluebird.fromCallback(cb =>
				client.multi()
					.hmset("invites:v2:code:" + inviteCode, {
						user: userid,
						added: new Date().getTime(),
						reference,
						active: (active ? 1 : 0)
					})
					.sadd("invites:v2:user:" + userid, inviteCode)
					.exec(cb)
			)

			return inviteCode
		})
	},
	activateCode: function (inviteCode, reference, cb) {
		return Bluebird.coroutine(function *() {
			const isMember = yield client.sismemberAsync("invites:v2:all", inviteCode)

			if (isMember) {
				yield client.hsetAsync("invites:v2:code:" + inviteCode, "active", 1)
			}

			if (isMember && reference) {
				yield client.hsetAsync("invites:v2:code:" + inviteCode, "reference", reference)
			}
		}).nodeify(cb)
	},
	getMyInvites: function (request, cb) {
		return request.session.logedinError().then(function () {
			return client.smembersAsync("invites:v2:user:" + request.session.getUserID())
		}).map(function (inviteCode) {
			return Bluebird.all([
				client.hgetallAsync("invites:v2:code:" + inviteCode),
				client.smembersAsync("invites:v2:code:" + inviteCode + ":used")
			]).spread(function (data, usedBy) {
				data.usedBy = usedBy
				data.code = inviteCode
				return data
			})
		}).filter((inviteData) =>
			inviteData.active === "1"
		).nodeify(cb)
	},
	byMail: function (request, mails, name, language, cb) {
		return Bluebird.try(function () {
			if (name) {
				name = escapeHtml(name)
			} else {
				name = false
			}

			return mails
		}).map(function (mail) {
			return invites.generateCode(request, mail, true).then(function (code) {
				return {
					code: code,
					mail: mail
				}
			})
		}).map(function (invite) {
			const sendMail = Bluebird.promisify(mailer.sendMail, {
				context: mailer
			})
			sendMail(invite.mail, "invite", {
				name: name,
				language: language,
				inviteCode: invite.code
			})
		}).nodeify(cb)
	},
	useCode: function (myUser, inviteCode, cb) {
		return Bluebird.coroutine(function *() {
			const userID = yield client.hgetAsync("invites:v2:code:" + inviteCode, "user")

			if (!userID) {
				return
			}

			const otherUser = yield User.getUser(userID)

			Notification.add([otherUser], "invite", "accepted", myUser.getID())

			client.sadd("invites:v2:code:" + inviteCode + ":used", myUser.getID(), this.parallel())
			client.hset("invites:v2:code:" + inviteCode, "active", 1, this.parallel())
			otherUser.addFriendRecommendation(myUser, 0, this.parallel())
			myUser.addFriendRecommendation(otherUser, 0, this.parallel())
		}).nodeify(cb)
	}
}

module.exports = invites
