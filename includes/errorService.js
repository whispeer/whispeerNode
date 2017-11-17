"use strict";

const Raven = require("raven");

const getExtra = (request) => {
	if (!request) {
		return {}
	}

	const headers = request.socket.handshake.headers
	const { channel, rawRequest } = request

	return {
		user: request.session.getUserID(),
		channel,
		rawRequest,
		headers
	}
}

var errorService = {
	handleError: function (e, request) {
		if (e) {
			const extra = getExtra(request)

			Raven.captureException(e, { extra });
		}
	}
};

process.on("unhandledRejection", function(reason) {
    errorService.handleError(reason);
});

module.exports = errorService;
