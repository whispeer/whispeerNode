#!/usr/bin/env node

/* eslint-disable no-console */

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

const Message = require("../includes/models/message")
const Chunk = require("../includes/models/chatChunk")
const Chat = require("../includes/models/chat")
const UserUnreadMessages = require("../includes/models/unreadMessage")
const pushTokenModel = require("../includes/models/pushTokenModel");

const Receivers = Chunk.ReceiverModel;

const KeyApi = require("../includes/crypto/KeyApi");

const Bluebird = require("bluebird");
const _ = require("lodash");
Bluebird.longStackTraces();

const setupP = Bluebird.promisify(setup);
const getKey = Bluebird.promisify(KeyApi.get);


// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
const requireConfirmation = Bluebird.promisify(function(message, action) {
	console.log(message);
	if (process.stdout.isTTY) {
		var stdin = process.openStdin();
		console.log("Press y and enter to continue!");

		stdin.on("data", function(chunk) {
			if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
				action();
			} else {
				console.log("Aborted!");
				process.exit(-1);
			}
		});
	} else {
		action();
	}
});

function removeKeyAndSubKeys(key) {
	return client.keysAsync(key + ":*").then(function (keys) {
		keys.push(key);

		return client.delAsync.apply(client, keys);
	});
}

function removePost(postID) {
	return removeKeyAndSubKeys("post:" + postID).then(function () {
		console.log("removed post: " + postID);
	});
}

function removeUserPosts(userid) {
	return client.zrangeAsync("user:" + userid + ":posts", 0, -1).map(removePost).then(function () {
		return client.delAsync("user:" + userid + ":posts");
	}).then(function () {
		console.log("Removed Users Posts");
	});
}

function removeUserCircles(userid) {
	return removeKeyAndSubKeys("user:" + userid + ":circle").then(function () {
		console.log("Removed Users Circles");
	});
}

function removeUserWall(userid) {
	return client.zrangeAsync("user:" + userid + ":wall", 0, -1).map(removePost).then(function () {
		return client.delAsync("user:" + userid + ":wall");
	}).then(function () {
		console.log("Removed Users Wall");
	});
}

function removeUserFromSearch(userid) {
	var search = require("../includes/search");

	return search.user.remove(userid).catch(function (e) {
		console.warn(e);
	});
}

function removeComment(id) {
	var postID = id.postID;
	var commentID = id.commentID;

	var postDomain = "post:" + postID + ":comments:";

	return client.multi()
		.del(postDomain + commentID + ":meta", postDomain + commentID + ":content")
		.zrem(postDomain + "list", commentID)
		.execAsync().then(function () {
			console.log("Removed comment " + id.postID + ":" + id.commentID);
		});
}

function removeUserComments(userid) {
	return client.keysAsync("post:*:comments:*:meta").filter(function (key) {
		return client.hgetAsync(key, "sender").then(function (senderID) {
			return parseInt(senderID, 10) === userid;
		});
	}).map(function (key) {
		var data = key.split(":");

		return {
			postID: data[1],
			commentID: data[3]
		};
	}).map(removeComment).then(function () {
		console.log("removed user comments");
	});
}

function removeUserNotifications(userid) {
	return client.smembersAsync("notifications:user:" + userid + ":all").then(function (notifications) {
		if (notifications.length === 0) {
			return;
		}

		return client.delAsync.apply(client, notifications.map(function (id) {
			return "notifications:byID:" + id;
		}));
	}).then(function () {
		return removeKeyAndSubKeys("notifications:user:" + userid);
	}).then(function () {
		console.log("removed user notifications");
	});
}

function removeUserSettings(userid) {
	return client.delAsync("user:" + userid + ":settings").then(function () {
		console.log("removed user settings");
	});
}

function removeUserProfiles(userid) {
	return Bluebird.all([
		removeKeyAndSubKeys("user:" + userid + ":profiles"),
		removeKeyAndSubKeys("user:" + userid + ":profile")
	]).then(function () {
		console.log("removed user profiles");
	});
}

function removeUserTrustManager(userid) {
	return client.delAsync("user:" + userid + ":trustManager").then(function () {
		console.log("removed user trustmanager");
	});
}

function removeUserSignatureCache(userid) {
	return client.delAsync("user:" + userid + ":signatureCache").then(function () {
		console.log("removed user signatureCache");
	});
}

const removeUserPushTokens = async (userID) =>
	pushTokenModel.destroy({
		where: {
			userID
		}
	});

const removeUserMessages = async (userID) => {
	const messages = await Message.findAll({
		where: {
			sender: userID
		},
		attributes: ["ChunkId"]
	});

	await Message.destroy({
		where: {
			sender: userID,
		}
	});

	await Receivers.destroy({
		where: {
			userID
		}
	});

	await UserUnreadMessages.destroy({
		where: {
			userID
		}
	});

	const chunkIds = _.uniq(messages.map((m) => m.getDataValue("ChunkId")));

	const deleteChunks = await Bluebird.resolve(chunkIds).filter(async (ChunkId) => {
		const messages = await Message.findAll({
			where: {
				ChunkId
			},
			attributes: ["id"],
			limit: 1
		});

		return messages.length === 0;
	});

	const chunks = await Chunk.findAll({
		where: {
			id: {
				$in: deleteChunks
			}
		},
		attributes: ["ChatId"]
	});

	console.log("Removing empty chunks:", deleteChunks);

	await Chunk.destroy({
		where: {
			id: {
				$in: deleteChunks
			}
		}
	})

	const chatIds = _.uniq(chunks.map((c) => c.getDataValue("ChatId")));

	const chatsToDelete = await Bluebird.resolve(chatIds).filter(async (ChatId) => {
		const chunks = await Chunk.findAll({
			where: {
				ChatId
			},
			attributes: ["id"],
			limit: 1
		});

		return chunks.length === 0;
	});

	console.log("Removing empty chats:", chatsToDelete);

	await Chat.destroy({
		where: {
			id: {
				$in: chatsToDelete
			}
		}
	})

	// TODO: update latest message!
}

function removeKey(key) {
	key = key.replace(/key:/, "");

	return getKey(key).then(function (theKey) {
		var removeKey = Bluebird.promisify(theKey.remove, {
			context: theKey
		});
		var multi = client.multi();

		return removeKey(multi).then(function () {
			var exec = Bluebird.promisify(multi.exec, {
				context: multi
			});
			return exec();
		});
	}).catch(function (e) {
		console.error(e);
	});
}

function removeUserKeys(userid) {
	return client.hgetAsync("user:" + userid, "nickname").then(function (nickname) {
		return client.keysAsync("key:" + nickname + ":*");
	}).filter(function (key) {
		return key.split(":").length === 3;
	}).filter(function (key) {
		return client.smembersAsync(key + ":access").then(function (access) {
			return access.length === 1 && parseInt(access[0], 10) === userid;
		});
	}).map(function (key) {
		return removeKey(key);
	}, { concurrency: 1 });
}

function removeUserFriends(userid) {
	return client.smembersAsync("friends:" + userid + ":requested").map(function (friendID) {
		return client.sremAsync("friends:" + friendID + ":requests", userid);
	}).then(function () {
		return client.smembersAsync("friends:" + userid);
	}).map(function (friendID) {
		console.log("removing from friend list: " + friendID);
		return client.smove("friends:" + friendID, "friends:" + friendID + ":deleted", userid);
	}).then(function () {
		return client.smembersAsync("friends:" + userid + ":requests");
	}).map(function (friendID) {
		console.log("removing from friend requested list: " + friendID);
		return client.smove("friends:" + friendID + ":requested", "friends:" + friendID + ":deleted", userid);
	}).then(function () {
		return removeKeyAndSubKeys("friends:" + userid);
	});
}

function removeUserMainData(userid) {
	return client.hgetAsync("user:" + userid, "mail").then(function (mail) {
		if (mail) {
			return client.delAsync("user:mail:" + mail);
		}
	}).then(function () {
		return client.delAsync("user:id:" + userid);
	}).then(function () {
		return client.sremAsync("user:list", userid);
	}).then(function () {
		return client.hgetAsync("user:" + userid, "nickname");
	}).then(function (nickname) {
		console.log("disabling nickname " + nickname + " forever (todo: better solution)");
		return client.setAsync("user:nickname:" + nickname.toLowerCase(), -1);
	}).then(function () {
		return removeKeyAndSubKeys("user:" + userid);
	}).then(function () {
		return Bluebird.all([
			client.zremAsync("user:registered", userid),
			client.sremAsync("user:online", userid),
			client.zremAsync("user:online:timed", userid)
		]);
	}).then(function () {
		console.log("removed user main data!");
	});
}

function disableUserLogin(userid) {
	return client.hsetAsync("user:" + userid, "disabled", 1);
}

function removeUserSessions(userid) {
	return client.keysAsync("session:*").filter(function (key) {
		return client.getAsync(key).then(function (value) {
			return parseInt(value, 10) === userid;
		});
	}).then(function (sessionKeys) {
		console.log("deleting " + sessionKeys.length + " sessions");

		if (sessionKeys.length === 0) {
			return;
		}

		return client.delAsync.apply(client, sessionKeys);
	});
}

const getAnalyticsDate = (key) => {
	return new Date(key.split(":").reverse()[0])
}

const getUserLastOnlineDay = (userid) => {
	console.time("getOnlineDay")
	return client.keysAsync("analytics:online:day:*").filter((key) => {
		return client.sismemberAsync(key, userid)
	}).then((keys) => {
		const sortedKeys = keys.sort((k1, k2) => {
			const d1 = getAnalyticsDate(k1)
			const d2 = getAnalyticsDate(k2)

			return d2 - d1
		})

		console.timeEnd("getOnlineDay")
		console.log("Online keys " + JSON.stringify(sortedKeys, null, 2))
		return sortedKeys[0]
	})
}

const getUserNickname = (userid) => {
	return client.hgetAsync(`user:${userid}`, "nickname")
}

const getUserInfo = (userid) => {
	return Bluebird.all([
		getUserLastOnlineDay(userid),
		getUserNickname(userid)
	])
}

var deleteUserID = parseInt(process.argv[2], 10);

if (deleteUserID < 1 || !deleteUserID) {
	console.log("Invalid user id");
	process.exit(-1);
}

Bluebird.try(() => {
	return setupP();
}).then(() => {
	return getUserInfo(deleteUserID)
}).then(([lastOnline, nickname]) => {
	console.log("User was last online", lastOnline)

	return requireConfirmation(`Deleting user ${deleteUserID} (${nickname})` )
}).then(function () {
	return disableUserLogin(deleteUserID);
}).then(function () {
	return removeUserSessions(deleteUserID);
}).then(function () {
	return removeUserFromSearch(deleteUserID);
}).then(function () {
	return removeUserPosts(deleteUserID);
}).then(function () {
	return removeUserWall(deleteUserID);
}).then(function () {
	return removeUserComments(deleteUserID);
}).then(function () {
	return removeUserNotifications(deleteUserID);
}).then(function () {
	return removeUserSettings(deleteUserID);
}).then(function () {
	return removeUserProfiles(deleteUserID);
}).then(function () {
	return removeUserTrustManager(deleteUserID);
}).then(function () {
	return removeUserSignatureCache(deleteUserID);
}).then(function () {
	return removeUserMessages(deleteUserID);
}).then(function () {
	return removeUserPushTokens(deleteUserID);
}).then(function () {
	return removeUserCircles(deleteUserID);
}).then(function () {
	return removeUserKeys(deleteUserID);
}).then(function () {
	return removeUserFriends(deleteUserID);
}).then(function () {
	return removeUserMainData(deleteUserID);
}).then(function () {
	process.exit();
});
