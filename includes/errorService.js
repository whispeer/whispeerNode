"use strict";

const Raven = require("raven");

var errorService = {
	handleError: function (e, request) {
		if (e) {
			if (request) {
				const headers = request.socket.handshake.headers
				const { channel, rawRequest } = request

				Raven.setUserContext({
					user: request.session.getUserID(),
					channel,
					rawRequest,
					headers
				})
			}

			Raven.captureException(e);
		}
	}
};

process.on("unhandledRejection", function(reason) {
    errorService.handleError(reason);
});

module.exports = errorService;
