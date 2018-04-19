"use strict";

const h = require("whispeerHelper");

const client = require("./redisClient");
const Bluebird = require("bluebird")

function SimpleUserDataStore(name) {
	this._name = name;
}

SimpleUserDataStore.prototype.get = function (request, cb) {
	return Bluebird
		.try(() => client.getAsync(`user:${request.session.getUserID()}:${this._name}`))
		.then((result) => JSON.parse(result))
		.nodeify(cb)
};

SimpleUserDataStore.prototype.set = function (request, newContent, cb) {
	return Bluebird
		.try(() => this._preSet(request, newContent))
		.then(() => client.setAsync(`user:${request.session.getUserID()}:${this._name}`, JSON.stringify(newContent)))
		.then((res) => {
			request.session.getOwnUser().then((user) => user.notify(this._name, newContent))

			return res === "OK"
		})
		.nodeify(cb)
}

SimpleUserDataStore.prototype.preSet = function (fn) {
	this._preSet = fn
}

SimpleUserDataStore.prototype.apiGet = function (data, fn, request) {
	return this.get(request)
		.then(function (result) {
		if (result && data) {
			const unchanged = result._signature && result._signature === data.cacheSignature ||
							result.meta && result.meta._signature && result.meta._signature === data.cacheSignature;

			if (unchanged) {
				const response = { unChanged: true };

				if (result.server) {
					response.content = { server: result.server };
				}

				return response
			}
		}

		return { content: result }
	}).nodeify(fn)
};

SimpleUserDataStore.prototype.apiSet = function (data, fn, request) {
	return this.set(request, data.content, h.objectifyResult("success", fn));
};


module.exports = SimpleUserDataStore;
