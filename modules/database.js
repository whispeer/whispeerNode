"use strict";
var logger = require("./logger.js").logger;
var step = require("step");

/** database class */
var Database = function () {
	var mysql = require('mysql');
	var config = require("./config.js");


	// Create a MySQL connection pool with
	// a max of 10 connections, a min of 2, and a 30 second max idle time
	var poolModule = require('generic-pool');
	/** our pool */
	var pool = poolModule.Pool({
		name     : 'mysql',
		create   : function (callback) {
			var c;
			if (config.server) {
				c = mysql.createConnection({
					socketPath: '/var/run/mysqld/mysqld.sock',
					user: config.user,
					password: config.password,
					database: config.db
				});
			} else {
				c = mysql.createConnection({
					host: 'localhost',
					user: config.user,
					password: config.password,
					database: config.db
				});
			}

			c.connect();

			// parameter order: err, resource
			// new in 1.0.6
			callback(null, c);
		},
		destroy  : function (client) { client.end(); },
		max      : 15,
		// optional. if you set this, make sure to drain() (see step 3)
		min      : 2,
		// specifies how long a resource can stay idle in pool before being removed
		idleTimeoutMillis : 30000,
		 // if true, logs via console.log - can also be a function
		log : logger.log
	});

	/** execute a statement
	* @param stmt statement to execute
	* @param params array of parameters
	* @param callback callback
	* @callback (err, results, fields): error, query results, query fields.
	*/
	this.exec = function (stmt, params, callback) {
		var theClient;
		step(function getCon() {
			pool.acquire(this);
		}, function theCon(err, client) {
			theClient = client;
			if (err) {
				logger.log(err, logger.ERROR);
				this(err);
			} else {
				theClient.query(stmt, params, this);
			}
		}, function queryDone(err, results, fields) {
			pool.release(theClient);
			callback(err, results, fields);
		});
	};

	/** on exit. Destroy all pool instances */
	this.exit = function () {
		pool.drain(function () {
			pool.destroyAllNow();
		});
	};
};

/** make it a singleton */
var theDatabase = new Database();

module.exports = theDatabase;