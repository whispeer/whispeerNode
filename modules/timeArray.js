"use strict";
var timeArray = function (removeAfter, doCheck) {
	var that = this;

	var hashMap = {};
	var List = require("../modules/doubleLinkedList.js");
	var list = new List();

	if (doCheck !== false && doCheck !== true) {
		doCheck = false;
	}

	var timerID;
	var theChecker;
	theChecker = function () {
		//console.log("called:" + new Date().getTime());
		if (doCheck && !list.isEmpty()) {
			that.check();
			if (!list.isEmpty()) {
				var lastTime = list.getLast().getTime();

				var nextCheck = (lastTime + removeAfter) - new Date().getTime();

				nextCheck = (nextCheck < 100 ? 100 : nextCheck);

				//console.log("call next time:" + nextCheck + "-" + new Date().getTime());

				clearTimeout(timerID);
				timerID = setTimeout(theChecker, nextCheck);
			} else {
				//console.log("list empty");
			}
		}
	};

	this.autoCheck = function () {
		doCheck = true;

		theChecker();
	};

	this.stopAutoCheck = function () {
		doCheck = false;
		clearTimeout(timerID);
	};

	this.add = function (object, id) {
		var listObject = list.createNode(object, id);
		if (typeof hashMap[id] !== "undefined") {
			throw new Error("Element already in TimedList!");
		}

		if (list.isEmpty()) {
			if (doCheck) {
				//console.log("start settimeout: " + removeAfter + "-" + new Date().getTime());
				clearTimeout(timerID);
				timerID = setTimeout(theChecker, removeAfter + 5);
			}
		}

		hashMap[id] = listObject;
		list.addFirst(listObject);
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
		list.print();
	};

	this.check = function () {
		if (list.isEmpty()) {
			return;
		}

		var current = list.getLast();

		var checkTime = new Date().getTime() - removeAfter;

		while (current.getTime() < checkTime && !list.isEmpty()) {
			current = current.previous;
			delete hashMap[current.next.id()];

			current.next.remove();
		}
	};

	this.used = function (id) {
		if (list.isEmpty()) {
			console.log("dafuq!");

			console.log(id);
			console.trace();

			return;
		}

		hashMap[id].updateTime();
		list.moveLast(hashMap[id]);
	};
};

module.exports = timeArray;