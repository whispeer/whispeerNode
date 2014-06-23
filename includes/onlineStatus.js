"use strict";
var client = require("./redisClient");

var step = require("step");
var h = require("whispeerHelper");

var friends = require("./friends");

var awayTimeout = 10*60*1000;

setInterval(function () {
	var time = new Date().getTime();
	step(function () {
		client.zrangebyscore("user:awayCheck", "-inf", time, this);
	}, h.sF(function (awayUsers) {
		awayUsers.map(function (userid) {
			friends.notifyUsersFriends(userid, "online", 1);
			client.del("user:" + userid + ":recentActivity", function (e)  {
				if (e) {
					console.error(e);
				}
			});
		});

		client.zremrangebyscore("user:awayCheck", "-inf", time, this);
	}), function (e) {
		if (e) {
			console.error(e);
		}
	});

}, 10*1000);


function OnlineStatusUpdater(view, session) {
	var userid, timeout;

	function removeSocket() {
		if (userid) {
			var socketID =  view.getSocket().id;
			var userIDToRemove = userid;
			timeout = 0;

			userid = 0;

			step(function () {
				client.srem("user:" + userIDToRemove + ":sockets", socketID, this);
			}, h.sF(function () {
				client.scard("user:" + userIDToRemove + ":sockets", this);
			}), h.sF(function (count) {
				if (count > 0) {
					this.ne();
				} else {
					client.multi()
						.srem("user:online", userIDToRemove)
						.zrem("user:awayCheck", userIDToRemove)
						.exec(this);
					friends.notifyUsersFriends(userIDToRemove, "online", 0);
					this.ne();
				}
			}), function (e) {
				console.error(e);
			});
		}
	}

	function addSocket() {
		userid = view.getUserID();
		var alreadyNotified = false;

		//add current user to online users - add current socket to users connections
		client.multi()
			.sadd("user:online", userid, function (error, added) {
				if (error) {
					console.error(error);
				}

				if (added) {
					alreadyNotified = true;
					friends.notifyAllFriends(view, "online", 2);
				}
			})
			//user went online so remove from notifiedUsers. maybe move to listener pattern later on.
			.srem("mail:notifiedUsers", view.getUserID())
			.sadd("user:" + userid + ":sockets", view.getSocket().id)
			.getset("user:" + userid + ":recentActivity", "1", function (error, oldValue) {
				if (!oldValue && !alreadyNotified) {
					friends.notifyAllFriends(view, "online", 2);
				}
			})
			.zadd("user:awayCheck", new Date().getTime() + awayTimeout, userid)
			.expire("user:" + userid + ":recentActivity", awayTimeout / 1000)
			.exec(function (e) {
				if (e) {
					console.error(e);
				}
			});
	}

	session.changeListener(function (logedin) {
		if (logedin) {
			addSocket();
		}
	});

	view.addToDestroy(removeSocket);

	this.recentActivity = function () {
		if (view.getUserID()) {
			addSocket();
		}
	};
}

module.exports = OnlineStatusUpdater;