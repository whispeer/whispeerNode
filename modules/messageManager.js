"use strict";

var TimeArray = require("./timeArray.js");

var helper = require("./helper.js").helper;
var logger = require("./logger.js").logger;
var step = require("Step");

var exceptions = require("./exceptions.js");
var NotExisting = exceptions.NotExisting;
var AccessException = exceptions.AccessException;
var InvalidMessage = exceptions.InvalidMessage;

var ssnH = helper;
var h = helper;

var TOPICTIME = 10 * 60 * 1000;
var MESSAGETIME = 5 * 60 * 1000;

var MessageManager = function () {
	var topics = new TimeArray(TOPICTIME, true);
	var messages = new TimeArray(MESSAGETIME, true);

	var Topic = function (id) {
		var loaded = false;
		var loadListener = [];
		var exists;

		var theTopic = this;

		var Receiver = function (userid, key, keySym, keySymIV) {
			this.getUserID = function () {
				return userid;
			};

			this.getKey = function () {
				if (h.isset(keySym) && h.isset(keySymIV)) {
					return {
						"ct": keySym,
						"iv": keySymIV
					};
				}

				return key;
			};
		};

		var receivers = [];

		this.getID = function () {
			return id;
		};

		this.addLoadListener = function (cb) {
			if (loaded === true) {
				cb(exists);
			} else {
				loadListener.push(cb);
			}
		};

		var setLoaded = function (err) {
			loaded = true;
			exists = (err ? false : true);

			if (!err instanceof NotExisting) {
				logger.log(err, logger.ERROR);
			}

			var i = 0;
			for (i = 0; i < loadListener.length; i += 1) {
				try {
					loadListener[i](exists);
				} catch (e) {
					logger.log(e, logger.ERROR);
				}
			}
		};

		this.isReceiver = function (view) {
			var i;
			for (i = 0; i < receivers.length; i += 1) {
				if (receivers[i].getUserID() === view.getUserID()) {
					return true;
				}
			}

			return false;
		};

		this.getKey = function (view) {
			var i;
			for (i = 0; i < receivers.length; i += 1) {
				if (receivers[i].getUserID() === view.getUserID()) {
					return receivers[i].getKey();
				}
			}

			throw new AccessException("not a receiver");
		};

		this.getNewestDate = function (cb, view) {
			step(function () {
				if (theTopic.isReceiver(view)) {
					var stmt = "SELECT `newestSend` from `messagetopics` WHERE `ID` = ? LIMIT 1";
					require("./database.js").exec(stmt, [id], this);
				} else {
					throw new AccessException("not a receiver");
				}
			}, h.sF(function (results) {
				if (results.length !== 1) {
					throw new NotExisting("wtf!");
				}

				this(null, results[0].newestSend);
			}), cb);
		};

		this.getNewest = function (cb, view) {
			step(function () {
				if (theTopic.isReceiver(view)) {
					var stmt = "SELECT `newest` from `messagetopics` WHERE `ID` = ? LIMIT 1";
					require("./database.js").exec(stmt, [id], this);
				} else {
					throw new AccessException("not a receiver");
				}
			}, h.sF(function (results) {
				if (results.length !== 1) {
					throw new NotExisting("wtf!");
				}

				var id = results[0].newest;
				MessageManager.getMessage(this, id);
			}), cb);
		};

		this.getOldest = function (cb, view) {
			step(function () {
				if (theTopic.isReceiver(view)) {
					var stmt = "SELECT `ID` from `messages` WHERE `topicid` = ? ORDER BY `sendDate` ASC LIMIT 1";
					require("./database.js").exec(stmt, [id], this);
				} else {
					throw new AccessException("not a receiver");
				}
			}, h.sF(function (results) {
				if (results.length !== 1) {
					throw new NotExisting("wtf!");
				}

				var id = results[0].ID;
				MessageManager.getMessage(this, id);
			}), cb);
		};

		this.getMessages = function (cb, view, index, count) {
			step(function () {
				if (theTopic.isReceiver(view)) {
					if (!h.isInt(index)) {
						index = 0;
						count = 20;
					}

					if (!h.isInt(count) || count > 50) {
						count = 20;
					}

					var stmt = "SELECT `ID` from `messages` WHERE `topicid` = ? ORDER BY `sendDate` DESC LIMIT ?, ?";
					require("./database.js").exec(stmt, [id, index, count], this);
				} else {
					throw new AccessException("not a receiver");
				}
			}, h.sF(function (results) {
				if (results.length < 1) {
					logger.log(results, logger.ERROR);
					throw new NotExisting("wtf!");
				}

				var ids = [];

				var i;
				for (i = 0; i < results.length; i += 1) {
					ids.push(results[i].ID);
				}

				this(null, ids);
			}), cb);
		};

		this.getMessagesByDate = function (cb, view, startDate, endDate) {
			step(function () {
				if (theTopic.isReceiver(view)) {
					//TODO!
					var stmt = "SELECT `ID` from `messages` WHERE `topicid` = ? AND `` AND `` ORDER BY `sendDate` DESC";
					require("./database.js").exec(stmt, [id, startDate, endDate], this);
				} else {
					throw new AccessException("not a receiver");
				}
			}, h.sF(function (results) {
				if (results.length < 1) {
					logger.log(results, logger.ERROR);
					throw new NotExisting("wtf!");
				}

				var ids = [];

				var i;
				for (i = 0; i < results.length; i += 1) {
					ids.push(results[i].ID);
				}

				this(null, ids);
			}), cb);
		};

		this.read = function (cb, view) {
			step(function getNewest() {
				theTopic.getNewest(this, view);
			}, h.sF(function theNewest(newestMessage) {
				newestMessage.isRead(this, view);
			}), cb);
		};

		this.getReceiver = function (view) {
			var receiverList = [];
			var i, isReceiver = false;
			for (i = 0; i < receivers.length; i += 1) {
				if (receivers[i].getUserID() === view.getUserID()) {
					isReceiver = true;
				}

				receiverList.push(receivers[i].getUserID());
			}

			if (isReceiver) {
				return receiverList;
			}

			throw new AccessException("not a receiver");
		};

		step(function () {
			var stmt = "SELECT `receiverid`, `key`, `symKey`, `symKeyIV` FROM `messagereceiver` WHERE `topicid` = ?";
			require("./database.js").exec(stmt, [id], this);
		}, h.sF(function (results) {
			var i, cur;
			for (i = 0; i < results.length; i += 1) {
				cur = results[i];
				receivers.push(new Receiver(cur.receiverid, cur.key, cur.symKey, cur.symKeyIV));
			}
		}), setLoaded);
	};

	var Message = function (id) {
		var loaded = false;
		var loadListener = [];
		var exists;

		var topicid, topic, signature, cryptedText, iv, sender, sendDate;
		var read = {};

		this.getID = function () {
			return id;
		};

		this.getTopicID = function () {
			return topicid;
		};

		this.getTopic = function () {
			return topic;
		};

		this.getSignature = function (view) {
			if (topic.isReceiver(view)) {
				return signature;
			}
		};

		this.getCryptedText = function (view) {
			if (topic.isReceiver(view)) {
				return cryptedText;
			}
		};

		this.getIV = function (view) {
			if (topic.isReceiver(view)) {
				return iv;
			}
		};

		this.getSender = function (view) {
			if (topic.isReceiver(view)) {
				return sender;
			}
		};

		this.getSendDate = function (view) {
			if (topic.isReceiver(view)) {
				return sendDate;
			}
		};

		this.addLoadListener = function (cb) {
			if (loaded === true) {
				cb(exists);
			} else {
				loadListener.push(cb);
			}
		};

		this.getJSON = function (view) {
			//TODO
		};

		var setLoaded = function (err) {
			loaded = true;
			exists = (err ? false : true);

			if (!err instanceof NotExisting) {
				logger.log(err, logger.ERROR);
			}

			var i = 0;
			for (i = 0; i < loadListener.length; i += 1) {
				try {
					loadListener[i](exists);
				} catch (e) {
					logger.log(e, logger.ERROR);
				}
			}
		};

		step(function () {
			var stmt = "SELECT `topicid`, `signature`, `cryptedText`, `iv`, `sender`, `sendDate` FROM `messages` WHERE `ID` = ? LIMIT 1";
			require("./database.js").exec(stmt, [id], this);
		}, h.sF(function (result) {
			if (result.length !== 1) {
				throw new NotExisting("message not existing " + id);
			}

			var cur = result[0];
			topicid = cur.topicid;
			signature = cur.signature;
			cryptedText = cur.cryptedText;
			iv = cur.iv;
			sender = cur.sender;
			sendDate = cur.sendDate;

			var stmt = "SELECT `userid`, `read` FROM `messageread` WHERE `messageid` = ?";
			require("./database.js").exec(stmt, [id], this);
		}), h.sF(function (results) {
			if (results.length < 1) {
				logger.log("read not properly added!", logger.ERROR);
				throw new AccessException("not a receiver");
			}

			var i, cur;
			for (i = 0; i < results.length; i += 1) {
				cur = results[i];

				read[cur.userid] = cur.read;
			}

			MessageManager.getTopic(this, topicid);
		}), h.sF(function (theTopic) {
			topic = theTopic;
		}), setLoaded);
	};

	this.getMessage = function (cb, id) {
		var theMessage;
		step(function loadMessage() {
			if (messages.has(id)) {
				theMessage = messages.get(id);
			} else {
				theMessage = new Message(id);
				messages.add(theMessage, id);
			}

			theMessage.addLoadListener(this);
		}, h.sF(function () {
			this(null, theMessage);
		}), cb);
	};

	this.getMessages = function (cb, ids) {
		step(function loadMessages() {
			var i;
			for (i = 0; i < ids.length; i += 1) {
				this.getMessage(this.parallel(), ids[i]);
			}
		}, h.sF(function (messages) {
			messages = h.orderCorrectly(messages, ids, "getID");

			this(null, messages);
		}), cb);
	};

	this.getTopic = function (cb, id) {
		var theTopic;
		step(function loadTopic() {
			if (topics.has(id)) {
				theTopic = topics.get(id);
			} else {
				theTopic = new Topic(id);
				topics.add(theTopic, id);
			}

			theTopic.addLoadListener(this);
		}, h.sF(function () {
			this(null, theTopic);
		}), cb);
	};

	/** send a message
	* @param cb callback
	* @param view the current View
	* @param esm encrypted and signed message object
	* @param receiver object of receiver => keys
	* @param topicid topicid for the message
	* @callback topicid, messageID
	*/
	this.sendMessage = function (cb, view, esm, receiver, topicid) {
		var theReceiver;
		var decodedMessage;
		var theTopicID, theTopic;

		var theMessageID;

		step(function () {
			if (view.getSession().checkLogin()) {
				var UserManager = require("./userManager.js");

				var hasReceiver = false;
				var receiverID;
				for (receiverID in receiver) {
					if (receiver.hasOwnProperty(receiverID)) {
						hasReceiver = true;
						UserManager.getUser(receiverID, this.parallel());
					}
				}

				if (!hasReceiver) {
					this(null, []);
				}
			} else {
				throw new AccessException("Not Logged In");
			}
		}, h.sF(function (receiverObjects) {
			theReceiver = receiverObjects;
			decodedMessage = h.decodeESM(esm);

			var nextFunction, overNextFunction;

			if (h.isset(topicid)) {
				nextFunction = function () {
					MessageManager.getTopic(this, topicid);
				};
				overNextFunction = function (topic) {
					theTopic = topic;
					theTopicID = topic.getID();
					this(null);
				};
			} else if (receiverObjects.length > 1) {
				nextFunction = h.sF(function createTopic() {
					var stmt = "Insert into `messagetopics` () VALUES ()";
					require("./database.js").exec(stmt, [], this);
				});

				overNextFunction = h.sF(function (result) {
					theTopicID = result.insertId;
					this(null);
				});
			} else {
				throw new InvalidMessage("need receiver or topicid");
			}

			step(nextFunction, overNextFunction, h.sF(function insertMessage() {
				var stmt = "Insert into `messages` (`topicid`, `signature`, `cryptedText`, `iv`, `sender`) VALUES (?, ?, ?, ?, ?)";
				require("./database.js").exec(stmt, [theTopicID, decodedMessage.s, decodedMessage.m, decodedMessage.iv, view.getUserID()], this);
			}), h.sF(function insertedMessage(result) {
				theMessageID = result.insertedId;

				var userid;
				for (userid in receiver) {
					if (receiver.hasOwnProperty(userid)) {
						var stmt = "Insert into `messagereceiver` (`topicid`, `receiverid`, `key`) VALUES (?, ?, ?)";
						require("./database.js").exec(stmt, [theTopicID, userid, receiver[userid]], this.parallel());

						stmt = "Insert into `messageread` (`messageid`, `userid`, `read`) VALUES (?, ?, 0)";
						require("./database.js").exec(stmt, [theMessageID, userid], this.parallel());
					}
				}
			}), h.sF(function () {
				var stmt = "Update `messagetopics` SET `newest` = ? WHERE `ID` = ?";
				require("./database.js").exec(stmt, [theMessageID, theTopicID]);
			}), h.sF(function (theMessage) {
				var i;
				for (i = 0; i < theReceiver.length; i += 1) {
					theReceiver[i].send("newmessage", theMessage.getJSON());
				}

				this(null, theTopicID, theMessageID);
			}), cb);
		}), cb);
	};

	this.getUnread = function (cb, view) {
		step(function getUnread() {
			var stmt = "Select DISTINCT(m.`topicid`) FROM `messageread` as mr, `messages` as m WHERE mr.`userid` = ? and mr.`read` = 0 and m.`ID` = mr.`messageid`";
			require("./database.js").exec(stmt, [view.getUserID()], this);
		}, h.sF(function theUnread(result) {
			var topics = [], i;
			for (i = 0; i < result.length; i += 1) {
				topics.push(result[i].topicid);
			}

			this(null, topics);
		}), cb);
	};

	this.getUserTopic = function (cb, view, userid) {
		step(function getTopicID() {
			var stmt = "SELECT `topicid`, COUNT(`receiverid`) as rcount " +
				"FROM `messagereceiver` WHERE " +
				"`topicid` IN (SELECT `topicid` FROM `messagereceiver` WHERE `receiverid` = ?) " +
				"and `topicid` IN (SELECT `topicid` FROM `messagereceiver` WHERE `receiverid` = ?) " +
				"GROUP BY `topicid` " +
				"ORDER BY COUNT(`receiverid`) ASC " +
				"LIMIT 1";
			require("./database.js").exec(stmt, [userid, view.getUserID()], this);
		}, h.sF(function (result) {
			var cur = result[0];

			if (cur.rcount === 2) {
				this(null, cur.topicid);
			} else {
				this(null, false);
			}
		}), cb);
	};

	this.getLatest = function (cb, view, start, count) {
		var theCount, theResults;

		//TODO check if found_rows works in this way and if there is NO PROBLEM
		step(function getLatest() {
			var stmt = "SELECT SQL_CALC_FOUND_ROWS mt.ID, mt.newest FROM `messagereceiver` as mr, `messagetopics` as mt WHERE mr.topicid = mt.ID and mr.receiverid = ? ORDER BY mt.newestSend DESC Limit ?, ?";
			require("./database.js").exec(stmt, [view.getUserID(), start, count], this);
		}, h.sF(function theLatest(result) {
			theResults = result;
			var stmt = "SELECT FOUND_ROWS() as count ";
			require("./database.js").exec(stmt, [], this);
		}), h.sF(function fTheCount(result) {
			theCount = result[0].count;
			var results = {};
			var i;
			for (i = 0; i < theResults.length; i += 1) {
				results[theResults[i].id] = theResults[i].newest;
			}

			this(null, results, theCount);
		}), cb);
	};
	//this.getLatestSend
};

MessageManager = new MessageManager();

module.exports = MessageManager;