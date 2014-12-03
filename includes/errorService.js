var errorService = {
	handleError: function (e) {
		console.error("could not add key with realid: " + realid);
		console.error(e);

		var errString;
		try {
			errString = JSON.stringify(e);
		} catch (e) {
			errString = e.toString();
		}
		mailer.mailAdmin("An Error occured", errString + "\r\n" + e.stack);
	}
};

module.exports = errorService;