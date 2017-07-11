"use strict";

const step = require("step");
const h = require("whispeerHelper");
const User = require("./user");

const RequestData = require("./requestData");

const errorService = require("./errorService");

const t = require("../topics/tmessage")

const versionGreater = (versionGiven, versionCompare) => {
	const splitGiven = versionGiven.split(".")
	const splitCompare = versionCompare.split(".")

	for (let i = 0; i < splitGiven.length; i += 1) {
		if (splitGiven[i] > splitCompare[i]) {
			return true
		}

		if (splitGiven[i] < splitCompare[i]) {
			return false
		}
	}

	return false
}

var listener = {
	"friends:online": function (socketData, data) {
		socketData.socket.emit("friendOnlineChange", {
			keys: [],
			uid: data.sender,
			status: data.content
		});
	},
	signatureCache: function () {},
	friendRequest: function (socketData, uid) {
		var request = new RequestData(socketData, {});
		step(function () {
			//we definitly need to add this users friendKey here!
			//maybe also get this users profile.
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(request, this);
		}), function (e, data) {
			if (!e) {
				socketData.socket.emit("friendRequest", {
					keys: request.getAllKeys(),
					uid: uid,
					user: data
				});
			} else {
				errorService.handleError(e, request);
			}
		});
	},
	friendAccept: function (socketData, uid) {
		var request = new RequestData(socketData, {});

		step(function () {
			User.getUser(uid, this);
		}, h.sF(function (theUser) {
			theUser.getUData(request, this);
		}), function (e, data) {
			if (!e) {
				socketData.socket.emit("friendAccept", {
					keys: request.getAllKeys(),
					uid: uid,
					user: data
				});
			} else {
				errorService.handleError(e, request);
			}
		});
	},
	synchronizeRead: function (socketData, { unreadChatIDs, unreadChunkIDs }) {
		socketData.socket.emit("unreadTopics", { unread: unreadChunkIDs })
		socketData.socket.emit("unreadChats", { unreadChatIDs })
	},
	message: function (socketData, { message }) {
		if (!message) {
			return
		}

		const version = socketData.getVersion()

		if (version && versionGreater(version, "0.0.3")) {
			return
		}

		const messageLegacyFormat = {
			content: message.content,
			meta: Object.assign({
				sender: message.server.sender,
				sendTime: message.server.sendTime,
				messageid: message.server.id,
				topicid: message.server.chunkID,
			}, message.meta),
		}

		socketData.socket.emit("message", {
			message: messageLegacyFormat
			// TODO: keys?
			// TODO: topic?
		})
	}
};

module.exports = listener;
