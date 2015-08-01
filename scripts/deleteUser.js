#!/usr/bin/env node

"use strict";

var setup = require("../includes/setup");
var client = require("../includes/redisClient");
var h = require("whispeerHelper");
var User = require("../includes/user");

var Bluebird = require("bluebird");
Bluebird.longStackTraces();

var setupP = Bluebird.promisify(setup);

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

function removeUserWall(userid) {
	return client.zrangeAsync("user:" + userid + ":wall", 0, -1).map(removePost).then(function () {
		return client.delAsync("user:" + userid + ":wall");
	}).then(function () {
		console.log("Removed Users Wall");
	});	
}

function removeUserFromSearch(userid) {
	var search = require("../includes/search");
	var remove = Bluebird.promisify(search.user.remove, search.user);

	return remove(userid).then(function () {
		console.log("removed user from search");
		return client.keysAsync("search:friends:*:search:id:" + userid);
	}).map(function (key) {
		var otherID = key.split(":")[2];
		console.log("removed from friends search: " + otherID);
		var friendsSearch = new search.friendsSearch(otherID);

		var removeFriendsSearch = Bluebird.promisify(friendsSearch.remove, friendsSearch);
		return removeFriendsSearch(userid);
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
		console.log("deleted user notifications");
	});
}

function removeUserSettings(userid) {
	return client.delAsync("user:" + userid + ":settings").then(function () {
		console.log("removed user settings");
	});
}

function removeUserProfiles(userid) {
	return client.smembersAsync("user:" + userid + ":profiles").then(function (profiles) {
		return client.delAsync.apply(client, profiles.map(function (profile) {
			return "user:" + userid + ":profile:" + profile;
		}));
	}).then(function () {
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

function removeUserSignedKeys(userid) {
	
}

function removeUserBackupKeys(userid) {
	
}

function removeUserFriends(userid) {

}

function removeUserKeys(userid) {
	
}

function removeUserMainData(userid) {

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
	process.exit();
});
