var client = require("./redisClient");

var step = require("step");
var h = require("whispeerHelper");

var friends = require("./friends");

function onlineStatusUpdater(view, session) {
	var userid = 0;

	function removeSocket() {
		console.log("remove socket " + view.getSocket().id + " from user " + userid);

		if (userid) {
			var userIDToRemove = userid;
			step(function () {
				client.srem("user:" + userIDToRemove + ":sockets", view.getSocket().id, this);
			}, h.sF(function () {
				client.scard("user:" + userIDToRemove + ":sockets", this);
			}), h.sF(function (count) {
				if (count > 0) {
					this.ne();
				} else {
					client.srem("user:online", userIDToRemove, this);
					this.ne();
				}
			}), function (e) {
				console.error(e);
			});

			friends.notifyAllFriends(view, "online", 0);

			userid = 0;
		}
	}

	session.changeListener(function (logedin) {
		if (logedin) {
			userid = view.getUserID();
			console.log("added socket " + view.getSocket().id + " from user " + userid);

			//add current user to online users - add current socket to users connections
			client.multi()
				.sadd("user:online", userid)
				.sadd("user:" + userid + ":sockets", view.getSocket().id)
				.set("user:" + userid + ":recentActivity", "1")
				.expire("user:" + userid + ":recentActivity", 10*60)
				.exec(function (e) {
					if (e) {
					console.error(e);
					}
				});
		}
	});

	view.addToDestroy(removeSocket);

	this.recentActivity = function (cb) {
		if (userid) {
			client.multi()
					.set("user:" + userid + ":recentActivity", "1")
					.expire("user:" + userid + ":recentActivity", 10*60)
					.exec(cb);
		} else {
			cb();
		}
	};
}

module.exports = onlineStatusUpdater;