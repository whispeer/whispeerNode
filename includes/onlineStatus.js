"use strict";
var client = require("./redisClient");

var step = require("step");
var h = require("whispeerHelper");

var friends = require("./friends");
var errorService = require("./errorService");
var Bluebird = require("bluebird");

var onlineTimeout = 30 * 1000;

setInterval(function removeOffline() {
	client.zrangebyscoreAsync("user:online:timed", 0, new Date().getTime() - onlineTimeout).then(function (offlineUsers) {
		if (offlineUsers.length > 0) {
			console.log("removed " + offlineUsers.length + " stale users");

			offlineUsers.forEach(function (userID) {
				friends.notifyUsersFriends(userID, "online", 0);
			});

			return Bluebird.all([
				client.zremAsync.apply(client, ["user:online:timed"].concat(offlineUsers)),
				client.sremAsync.apply(client, ["user:online"].concat(offlineUsers))
			]);
		}
	}).catch(errorService.handleError);
}, onlineTimeout);

function OnlineStatusUpdater(socketData, session) {
	var userIDToRemove, intervalID;

	function removeSocket() {
		if (!userIDToRemove) {
			return;
		}

		var internalUserIDToRemove = userIDToRemove;
		var socketID =  socketData.socket.id;
		userIDToRemove = 0;

		step(function () {
			client.srem("user:" + internalUserIDToRemove + ":sockets", socketID, this);
		}, h.sF(function () {
			client.scard("user:" + internalUserIDToRemove + ":sockets", this);
		}), h.sF(function (count) {
			if (count > 0) {
				this.ne();
			} else {
				client.multi()
					.zrem("user:online:timed", internalUserIDToRemove)
					.srem("user:online", internalUserIDToRemove)
					.exec(this);
				friends.notifyUsersFriends(internalUserIDToRemove, "online", 0);
				this.ne();
			}
		}), errorService.handleError);
	}

	function updateOnline() {
		var userID = socketData.session.getUserID();
		if (socketData.isConnected() && userID) {
			//check that socket is still connected
			client.zadd("user:online:timed", new Date().getTime(), userID, errorService.handleError);
		} else {
			clearInterval(intervalID);
		}
	}

	function track() {
		var userID = socketData.session.getUserID();
		var now = new Date();

		now.setMilliseconds(0);
		now.setSeconds(0);
		now.setMinutes(0);

		var month = now.getFullYear() + "-" + (now.getMonth() + 1);
		var week = now.getFullYear() + " W" + h.getWeekNumber(now);
		var day = month + "-" + now.getDate();
		var hour = day + " " + now.getHours() + "h";

		client.multi()
			.sadd("analytics:online:hour:" + hour, userID)
			.sadd("analytics:online:day:" + day, userID)
			.sadd("analytics:online:week:" + week, userID)
			.sadd("analytics:online:month:" + month, userID)
			.exec(errorService.handleError);
	}

	function addSocket() {
		userIDToRemove = socketData.session.getUserID();

		var userid = userIDToRemove;
		var socketID =  socketData.socket.id;

		intervalID = setInterval(updateOnline, onlineTimeout / 4);

		try {
			track();
		} catch (e) {
			errorService.handleError(e);
		}

		//add current user to online users - add current socket to users connections
		client.multi()
			.zadd("user:online:timed", new Date().getTime(), userid, function (error, added) {
				if (error) {
					errorService.handleError(error);
					return;
				}

				if (added) {
					friends.notifyAllFriends(socketData, "online", 2);
				}
			})
			.sadd("user:online", userid)
			.sadd("user:" + userid + ":sockets", socketID)
			//user went online so remove from notifiedUsers. maybe move to listener pattern later on.
			.srem("mail:notifiedUsers", userid)
			.exec(errorService.handleError);
	}

	session.changeListener(function (logedin) {
		if (logedin) {
			addSocket();
		} else {
			removeSocket();
		}
	});

	socketData.once("disconnect", removeSocket);

	this.recentActivity = function () {};
}

module.exports = OnlineStatusUpdater;
