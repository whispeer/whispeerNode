"use strict";

const setup = require("../includes/setup");
const client = require("../includes/redisClient");

const Bluebird = require("bluebird");
Bluebird.longStackTraces();

// requireConfirmation will ask the user to confirm by typing 'y'. When
// not in a tty, the action is performed w/o confirmation.
var requireConfirmation = Bluebird.promisify(function(message, action) {
	console.log(message);
	if (process.stdout.isTTY) {
		var stdin = process.openStdin();
		console.log("Press y and enter to continue!");

		stdin.on("data", function(chunk) {
			if (chunk.toString().toLowerCase().substr(0, 1) === "y") {
				action();
			} else {
				console.log("Aborted!");
				process.exit(-1);
			}
		});
	} else {
		action();
	}
});

const pattern = process.argv[2]

if (!pattern) {
	throw new Error("No pattern given")
}

setup().then(() =>
	requireConfirmation(`Really delete all redis values matching ${pattern}`)
).then(() =>
	client.keysAsync(pattern)
).then((keys) => {
	return requireConfirmation(`Please confirm a second time. Pattern: ${pattern} Number of keys: ${keys.length}`).thenReturn(keys)
}).map((key) =>
	client.delAsync(key)
).then(() => process.exit(0))
