"use strict"

const Bluebird = require("bluebird")
const validator = require("whispeerValidations");
const h = require("whispeerHelper")

const sequelize = require("../includes/dbConnector/sequelizeClient")
const mailer = require("../includes/mailer")
const pushAPI = require("../includes/pushAPI")
const UserUnreadMessage = require("../includes/models/unreadMessage")
const User = require("../includes/user")
const errorService = require("../includes/errorService")
const KeyApi = require("../includes/crypto/KeyApi")

//maximum difference: 5 minutes.
const MAXTIME = 60 * 60 * 1000;

const UNREAD_TOPICS_QUERY = `
	SELECT DISTINCT "Messages"."ChunkId" from "Messages"
	INNER JOIN "UserUnreadMessages" ON
		"Messages"."id" = "UserUnreadMessages"."MessageId" AND
		"UserUnreadMessages"."userID" = $userID
`

const getUnreadChatIDs = (userID) => {
	return UserUnreadMessage.findAll({
		attributes: ["ChatId"],
		where: {
			userID: userID
		},
		group: ["ChatId"]
	}).map((entry) => entry.ChatId)
}

const ensureUserKeyAccess = (uid, key) => {
	return KeyApi.get(key).then(function (key) {
		return key.hasUserAccess(uid);
	}).then((access) => {
		if (!access) {
			throw new Error(`keys might not be accessible by all user ${key} - ${uid}`);
		}
	})
}

const validateChunk = (request, chunkMeta, receiverKeys) => {
	const receiverIDs = chunkMeta.receiver;
	const receiverWO = receiverIDs.filter(h.not(request.session.isMyID));

	return Bluebird.try(function () {
		var err = validator.validate("topicCreate", chunkMeta);

		if (err) {
			throw new InvalidChunkData();
		}

		if (!request.session.isMyID(chunkMeta.creator)) {
			throw new InvalidChunkData("session changed? invalid creator!");
		}

		if (Math.abs(chunkMeta.createTime - new Date().getTime()) > MAXTIME) {
			throw new InvalidChunkData("max time exceeded!");
		}

		return User.checkUserIDs(receiverIDs);
	}).then(function () {
		return Bluebird.resolve(receiverWO).map(function (uid) {
			return Bluebird.all([
				ensureUserKeyAccess(uid, chunkMeta._key),
				ensureUserKeyAccess(uid, receiverKeys[uid]),
			])
		});
	})
}

const getUserNotificationsCount = (userID) => {
	return UserUnreadMessage.count({
		where: {
			userID
		}
	})
}

const updateBadge = (userID) => {
	return getUserNotificationsCount(userID).then((notificationsCount) =>
		pushAPI.updateBadgeForUser(userID, notificationsCount)
	)
}

const pushToUser = (userID, data, senderName) => {
	const referenceType = "message"

	if (data.message) {
		const server = data.message.server

		data.message.meta = Object.assign({
			sender: server.sender,
			sendTime: server.sendTime,
			messageid: server.id,
			topicid: server.chunkID,
		}, data.message.meta)
	}

	const pushData = pushAPI.pushDataToUser(userID, data)

	if (!data.message) {
		return pushData
	}

	const pushNotification = pushAPI.getTitle(new User(userID), referenceType, senderName).then((title) =>
		pushAPI.notifyUser(userID, title, {
			type: referenceType,
			id: data.message.server.chunkID,
			chatID: data.message.server.chatID
		})
	)

	return Bluebird.all([
		pushNotification,
		pushData,
		updateBadge(userID),
	])
}

const getUserName = (request, userID) => {
	var user = new User(userID)

	return user.getNames(request).then((userNames) => {
		return userNames.firstName || userNames.lastName || userNames.nickname
	})
}

const pushNotify = (request, receiverIDs, data) => {
	const senderID = request.session.getUserID()

	var receivers = receiverIDs.filter(function (userID) {
		return userID !== senderID
	}).map((uid) => new User(uid))

	if (receivers.length === 0) {
		return Bluebird.resolve()
	}

	return Bluebird.all([
		getUserName(request, senderID),
		Bluebird.resolve(receivers).filter((user) => user.isBlocked(senderID).then((blocked) => !blocked))
	]).then(([senderName, receivers]) => {
		if (data.message) {
			mailer.sendInteractionMails(receivers, "message", "new", {
				sender: senderName,
				interactionID: data.message.server.chunkID
			})
		}

		return Bluebird.all(receivers.map((receiver) =>
			pushToUser(receiver.getID(), data, senderName)
		))
	})
}

const getUnreadChunkIDs = (userID) => {
	return sequelize.query(UNREAD_TOPICS_QUERY, {
		type: sequelize.QueryTypes.SELECT,
		bind: {
			userID: userID
		},
	}).map((chunk) => chunk.ChunkId)
}

const synchronizeRead = (request) => {
	return Bluebird.all([
		getUnreadChunkIDs(request.session.getUserID()),
		getUnreadChatIDs(request.session.getUserID()),
	]).then(([unread, chatIDs]) => {
		request.socketData.notifyOwnClients("synchronizeRead", {
			unreadChatIDs: chatIDs,
			unreadChunkIDs: unread
		});
	}).catch((e) => errorService.handleError(e, request))
}

module.exports = {
	pushNotify,
	updateBadge,
	getUnreadChunkIDs,
	getUnreadChatIDs,
	synchronizeRead,
	validateChunk,
}
