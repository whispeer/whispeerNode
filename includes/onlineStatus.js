var client = require("./redisClient");

var step = require("step");
var h = require("whispeerHelper");

var friends = require("./friends");

function onlineStatusUpdater(view, session) {
	var userid;

	function removeSocket() {
		console.log("remove socket " + view.getSocket().id + " from user " + userid);

		if (userid) {
			var socketID =  view.getSocket().id;
			var userIDToRemove = userid;

			userid = 0;

			step(function () {
				client.srem("user:" + userIDToRemove + ":sockets", socketID, this);
			}, h.sF(function () {
				client.scard("user:" + userIDToRemove + ":sockets", this);
			}), h.sF(function (count) {
				if (count > 0) {
					this.ne();
				} else {
					client.srem("user:online", userIDToRemove, this);
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

		console.log("added socket " + view.getSocket().id + " from user " + userid);

		//add current user to online users - add current socket to users connections
		client.multi()
			.sadd("user:online", userid, function (error, added) {
				if (error) {
					console.error(error);
				}

				if (added) {
					friends.notifyAllFriends(view, "online", 2);
				}
			})
			.sadd("user:" + userid + ":sockets", view.getSocket().id)
			.set("user:" + userid + ":recentActivity", "1")
			.expire("user:" + userid + ":recentActivity", 10*60)
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

module.exports = onlineStatusUpdater;