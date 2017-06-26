#!/usr/bin/env node

"use strict";

var client = require("./includes/redisClient");

var step = require("step");
var h = require("whispeerHelper");

var fs = require("fs");
var path = require("path");

var migrationState, availableMigrations, highestMigrationState;

var migrationToRun = process.argv[2];

var runMigrations;

const setup = require("./includes/setup");

function fileNameToID(name) {
	return h.parseDecimal(name.split("-")[0]);
}

function getMigrationPath(id) {
	var i;
	for (i = 0; i < availableMigrations.length; i += 1) {
		if (fileNameToID(availableMigrations[i]) === id) {
			return "./migrations/" + availableMigrations[i];
		}
	}

	throw new Error("Migration not found: " + id);
}

function updateMigrationState(state, cb) {
	step(function () {
		client.set("server:migrationState", migrationState + 1, this);
	}, h.sF(function () {
		migrationState += 1;

		if (migrationState < highestMigrationState) {
			runMigrations(this);
		} else {
			this.ne();
		}
	}), cb);
}

function runMigration(id, cb) {
	console.log("runing migration " + id);
	step(function () {
		var toRun = getMigrationPath(id);

		require(toRun)(this);
	}, h.sF(function (success) {
		if (success) {
			console.log("Migration Completed: " + (id));
			this.ne();
		} else {
			throw new Error("Migration failed! " + id);
		}
	}), cb);
}

runMigrations = function (cb) {
	step(function () {
		runMigration(migrationState + 1, this);
	}, h.sF(function () {
		updateMigrationState(migrationState + 1, this);
	}), cb);
};

function loadMigrations(cb) {
	step(function () {
		fs.readdir(path.resolve(__dirname, "migrations"), this);
	}, h.sF(function (files) {
		availableMigrations = files.filter(function (file) {
			return fs.statSync(file).isFile();
		});
		this.ne();
	}), cb);
}

function getNewestMigrationCount(cb) {
	step(function () {
		loadMigrations(this);
	}, h.sF(function () {
		var highest = 0;
		availableMigrations.forEach(function (file) {
			var current = fileNameToID(file);
			highest = Math.max(highest, current);
		});

		console.log("Highest available Migration: " + highest);

		this.ne(highest);
	}), cb);
}

if (migrationToRun) {
	step(function () {
		setup(this);
	}, h.sF(function () {
		loadMigrations(this);
	}), h.sF(function () {
		runMigration(h.parseDecimal(migrationToRun), this);
	}), function (e) {
		if (e) {
			throw e;
		}

		console.log("Migration completed");
		process.exit(0);
	});
} else {
	step(function () {
		setup(this);
	}, h.sF(function () {
		client.get("server:migrationState", this);
	}), h.sF(function (_migrationState) {
		migrationState = h.parseDecimal(_migrationState) || 0;

		console.log("Current Migration State: " + migrationState);

		getNewestMigrationCount(this);
	}), h.sF(function (_highestMigrationState) {
		highestMigrationState = _highestMigrationState;
		if (highestMigrationState === migrationState) {
			this.last.ne();

			console.log("No Migrations available");
		} else {
			console.log("Running " + (highestMigrationState - migrationState) + " Migration(s)");

			runMigrations(this);
		}
	}), function (e) {
		if (e) {
			throw e;
		}

		process.exit(0);
	});
}
