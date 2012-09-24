"use strict";
var timeArray = function (removeAfter, doCheck) {
	var that = this;

	var hashMap = {};
	var list = null;

	if (doCheck !== false && doCheck !== true) {
		doCheck = false;
	}

	var DoubleLinkedListObject = function (obj, id) {
		var time = new Date().getTime();
		var that = this;

		this.previous = that;
		this.next = that;
		this.getTime = function () {
			return time;
		};

		this.updateTime = function () {
			time = new Date().getTime();
		};

		this.obj = function () {
			return obj;
		};

		this.id = function () {
			return id;
		};

		this.append = function (dlObject) {
			dlObject.previous = that;
			dlObject.next = that.next;

			that.next.previous = dlObject;
			that.next = dlObject;
		};

		this.prepend = function (dlObject) {
			if (list.id() === id) {
				list = dlObject;
			}

			dlObject.previous = that.previous;
			dlObject.next = that;

			that.previous.next = dlObject;
			that.previous = dlObject;
		};

		this.remove = function () {
			if (list.id() === id) {
				list = that.next;
			}

			that.previous.next = that.next;
			that.next.previous = that.previous;

			that.previous = that;
			that.next = that;
		};
	};

	var theChecker;
	theChecker = function () {
		if (doCheck && list !== null) {
			that.check();
			if (list !== null) {
				var lastTime = list.previous.getTime();

				var nextCheck = (lastTime + removeAfter) - new Date().getTime() + 100;
				nextCheck = (nextCheck < 1000 ? 1000 : nextCheck);
				setTimeout(theChecker, nextCheck);
			}
		}
	};

	this.autoCheck = function () {
		doCheck = true;

		theChecker();
	};

	this.stopAutoCheck = function () {
		doCheck = false;
	};

	this.add = function (object, id) {
		var dlObject = new DoubleLinkedListObject(object, id);
		if (typeof hashMap[id] !== "undefined") {
			throw new Error("Element already in TimedList!");
		}

		hashMap[id] = dlObject;

		if (list === null) {
			list = dlObject;
			if (doCheck) {
				setTimeout(theChecker, removeAfter);
			}
		} else {
			list.prepend(dlObject);
		}
	};

	this.has = function (id) {
		return (typeof hashMap[id] !== "undefined");
	};

	this.get = function (id) {
		if (!this.has(id)) {
			return null;
		}

		this.used(id);
		return hashMap[id].obj();
	};

	this.show = function () {
		var current = list;
		console.log(current.previous.id() + " => " + current.getTime() + "-" + current.id() + " => " + current.next.id());

		current = current.next;
		while (current.id() !== list.id()) {
			console.log(current.previous.id() + " => " + current.getTime() + "-" + current.id() + " => " + current.next.id());
			current = current.next;
		}

		console.log("");
	};

	this.check = function () {
		var current = list.previous;
		var checkTime = new Date().getTime() - removeAfter;

		console.log("Deletetime:" + checkTime);
		console.log("Next Element:" + current.getTime() + " - " + current.id());

		while (current.getTime() < checkTime) {
			console.log("Removing:" + current.getTime() + " - " + current.id());

			if (current.previous === current) {
				if (current.getTime() > checkTime) {
					list = null;
				}

				break;
			}

			current = current.previous;
			delete hashMap[current.next.id()];

			console.log("");
			console.log("Next:" + current.getTime() + " - " + current.id());

			current.next.remove();
		}
	};

	this.used = function (id) {
		hashMap[id].updateTime();
		hashMap[id].remove();

		list.prepend(hashMap[id]);
	};
};

module.exports = timeArray;