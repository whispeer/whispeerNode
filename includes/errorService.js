"use strict";

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

			console.error(e, extra);
		}
	}
};

module.exports = errorService;
