"use strict";

/** a list element */
var ListElement = function (obj, id, list) {
	var time = new Date().getTime();
	var that = this;

	this.previous = that;
	this.next = that;
	/** get the list elements time */
	this.getTime = function () {
		return time;
	};

	/** set the list elements time to now */
	this.updateTime = function () {
		time = new Date().getTime();
	};

	/** get the list elements object */
	this.obj = function () {
		return obj;
	};

	/** get the list elements id */
	this.id = function () {
		return id;
	};

	/** append an object after this list element */
	this.append = function (dlObject) {
		list.addAfter(that, dlObject);
	};

	/** prepend an object before this list element */
	this.prepend = function (dlObject) {
		list.addBefore(that, dlObject);
	};

	/** remove this object from the list */
	this.remove = function () {
		list.remove(that);
	};

	/** get the list of this listElement
	* Warning: it has not to be in that list.
	*/
	this.getList = function () {
		return list;
	};
};

/** a list. */
var List = function () {
	var anchor = null;
	var that = this;

	var checkNode = function (node) {
		if (node instanceof ListElement && node.getList() === that) {
			return;
		}

		throw new Error("not the same list!");
	};

	this.print = function () {
		if (that.isEmpty()) {
			console.log("empty list");
			return;
		}

		console.log(anchor.id() + "=>");
		var current = anchor.next;

		var counter = 0;
		while (current !== anchor && counter < 1000) {
			console.log(current.id() + "=>");
			counter += 1;

			current = current.next;
		}

		console.log(anchor.id());
		console.log("");
	};

	/** the length of the list. */
	this.length = function () {
		if (that.isEmpty()) {
			return 0;
		}

		var counter = 1;
		var current = anchor.next;

		while (current !== anchor && counter < 1000) {
			counter += 1;

			current = current.next;
		}

		return counter;
	};

	/** is the list empty (anchor === null) */
	this.isEmpty = function () {
		return (anchor === null);
	};

	/** remove a node. */
	this.remove = function (node) {
		checkNode(node);

		if (node === anchor && node.previous === node) {
			anchor = null;
			return;
		}

		if (node === anchor) {
			anchor = node.next;
		}

		node.previous.next = node.next;
		node.next.previous = node.previous;

		node.previous = node;
		node.next = node;
	};

	/** add a node before a given node
	* @param node node to add before
	* @param toAdd node to add.
	*/
	this.addBefore = function (node, toAdd) {
		checkNode(node);
		checkNode(toAdd);

		if (toAdd.next !== toAdd || toAdd.previous !== toAdd) {
			throw new Error("element already in list - use move!");
		}

		toAdd.previous = node.previous;
		toAdd.next = node;

		node.previous.next = toAdd;
		node.previous = toAdd;

		if (node === anchor) {
			anchor = toAdd;
		}
	};

	/** add a node after a certain node
	* @param node node to add after
	* @param toAdd node to add.
	*/
	this.addAfter = function (node, toAdd) {
		checkNode(node);
		checkNode(toAdd);

		if (toAdd.next !== toAdd || toAdd.previous !== toAdd) {
			throw new Error("element already in list - use move!");
		}

		toAdd.previous = node;
		toAdd.next = node.next;

		node.next.previous = toAdd;
		node.next = toAdd;
	};

	/** add a node as the first node. */
	this.addFirst = function (node) {
		checkNode(node);

		if (that.isEmpty()) {
			anchor = node;

			return;
		}

		that.addBefore(anchor, node);
	};

	/** add a node as the last node */
	this.addLast = function (node) {
		checkNode(node);

		if (that.isEmpty()) {
			anchor = node;

			return;
		}

		that.addAfter(anchor.previous, node);
	};

	/** move a node to the first place */
	this.moveFirst = function (node) {
		that.remove(node);
		that.addFirst(node);
	};

	/** move a node to the last place */
	this.moveLast = function (node) {
		that.remove(node);
		that.addLast(node);
	};

	/** get the first node */
	this.getFirst = function () {
		return anchor;
	};

	/** get the latest node */
	this.getLast = function () {
		if (that.isEmpty()) {
			return anchor;
		}

		return anchor.previous;
	};

	/** get the node at a certain position */
	this.getNode = function (position) {
		if (that.isEmpty()) {
			return null;
		}

		if (position === 0) {
			return anchor;
		}

		var counter = 0;
		var current = anchor.next;

		while (current !== anchor) {
			counter += 1;

			if (counter === position) {
				return current;
			}

			current = current.next;
		}

		return null;
	};

	/** create a node with a given object and id */
	this.createNode = function (obj, id) {
		return new ListElement(obj, id, that);
	};
};

module.exports = List;