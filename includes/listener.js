"use strict";

const User = require("./user");
const RequestData = require("./requestData");

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
		const request = new RequestData(socketData, {});
		return User.getUser(uid)
			.then((theUser) => theUser.getUData(request))
			.then((user) => socketData.socket.emit("friendRequest", { keys: request.getAllKeys(), uid, user }))
	},
	friendAccept: function (socketData, uid) {
		const request = new RequestData(socketData, {});

		return User.getUser(uid)
			.then((theUser) => theUser.getUData(request))
			.then((user) => socketData.socket.emit("friendAccept", { keys: request.getAllKeys(), uid, user }))
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
