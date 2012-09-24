var TimeArray = require("./modules/timeArray.js");

var timedArray = new TimeArray(1000);

timedArray.add("Test", 4);
timedArray.add("Hallo", 5);
timedArray.add("Bla", 7);

try {
	timedArray.add("bla", 7);
} catch (e) {
	console.log("Y");
}

setTimeout(function () {
	timedArray.show();

	if (timedArray.get(4) === "Test") {
		console.log("Y");
	} else {
		console.log("N");
	}

	timedArray.show();

	setTimeout(function () {
		timedArray.check();
	}, 500);
}, 500);