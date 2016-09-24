#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");

var KeyApi = require("../includes/crypto/KeyApi");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);
var getKey = Bluebird.promisify(KeyApi.get);


// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
var requireConfirmation = Bluebird.promisify(function(message, action) {
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

function deleteMessage(messageID, topicID, userid) {
	return Bluebird.all([
		client.zremAsync("topic:" + topicID + ":messages", messageID),
		client.zremAsync("topic:" + topicID + ":user:" + userid + ":messages", messageID)
	]).then(function () {
		return removeKeyAndSubKeys("message:" + messageID);
	});
}

function getReceivers(topicID) {
	return client.smembersAsync("topic:" + topicID + ":receiver");
}

function removeTopic(topicID) {
	return getReceivers(topicID).each(function (receiverID) {
		return Bluebird.all([
			client.zremAsync("topic:user:" + receiverID + ":topics", topicID),
			client.zremAsync("topic:user:" + receiverID + ":unreadTopics", topicID)
		]);
	}).then(function () {
		return removeKeyAndSubKeys("topic:" + topicID);
	}).then(function () {
		console.log("removed topic: " + topicID);
	});
}

function updateNewest(topicID) {
	return client.zrangeAsync("topic:" + topicID + ":messages", -1, -1).then(function (newest) {
		if (newest.length === 0) {
			return removeTopic(topicID);
		}

		return client.hsetAsync("topic:" + topicID + ":server", "newest", newest[0]);
	});
}

function removeUserMessagesFromTopic(topicID, userid) {
	console.log("removing messages from topic: " + topicID);

	return client.zrangeAsync("topic:" + topicID + ":user:" + userid + ":messages", 0, -1).each(function (messageID) {
		console.log("deleting message: " + messageID);
		return deleteMessage(messageID, topicID, userid);
	}).then(function () {
		console.log("updating newest message for topic: " + topicID);
		return updateNewest(topicID);
	});
}

function removeUserMessages(userid) {
	return client.zrangeAsync("topic:user:" + userid + ":topics", 0, -1).each(function (topicID) {
		return removeUserMessagesFromTopic(topicID, userid);
	}).then(function () {
		return removeKeyAndSubKeys("topic:user:" + userid);
	}).then(function () {
		console.log("removed user messages");
	});
}

function removeKey(key) {
	key = key.replace(/key:/, "");

	return getKey(key).then(function (theKey) {
		var removeKey = Bluebird.promisify(theKey.remove, theKey);
		var multi = client.multi();

		return removeKey(multi).then(function () {
			var exec = Bluebird.promisify(multi.exec, multi);
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

var deleteUserID = parseInt(process.argv[2], 10);

if (deleteUserID < 1 || !deleteUserID) {
	console.log("Invalid user id");
	process.exit(-1);
}

requireConfirmation("Deleting user " + deleteUserID).then(function () {
	return setupP();
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
