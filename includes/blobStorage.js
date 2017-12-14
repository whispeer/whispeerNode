"use strict";

const fs = require("fs");
const Bluebird = require("bluebird")

const client = require("./redisClient");

function isBlobID(blobid) {
	return blobid.match(/^[A-z0-9]*$/);
}

function blobIDtoFile(blobid) {
	return "files/" + blobid + ".png";
}

function checkBlobExists(blobid) {
	return Bluebird.try(() => {
		return client.sismemberAsync("blobs:usedids", blobid);
	}).then((ismember) => {
		if (!ismember) {
			throw new BlobNotFound();
		}
	})
}

function useBlobID(blobid) {
	return Bluebird.try(() => {
		if (isBlobID(blobid)) {
			return client.sremAsync("blobs:reserved", blobid);
		}

		throw new InvalidBlobID("Not a blob id " + blobid);
	}).then((removed) => {
		if (removed === 1) {
			return blobid
		}

		throw new InvalidBlobID("Blob ID not reserved");
	})
}

var code = require("./session").code;

var BLOBIDLENGTH = 30;

const createBlobID = () =>
	Bluebird.coroutine(function *() {
		const blobid = yield code(BLOBIDLENGTH);
		const isNoMember = yield client.saddAsync("blobs:allids", blobid);

		if (isNoMember === 1) {
			return blobid
		}

		return createBlobID()
	})

const readFile = (blobid) =>
	Bluebird.fromCallback(function (cb) {
		fs.readFile(blobIDtoFile(blobid), cb);
	}).catch((err) => {
		console.log(err)
		throw new BlobNotFound(blobid);
	})

const getBlobData = (request, blobid) =>
	Bluebird
		.try(() => request.session.logedinError())
		.then(() => checkBlobExists(blobid))
		.then(() => client.sismemberAsync("blobs:usedids", blobid))
		.then((exists) => {
			if (!exists) {
				throw new BlobNotFound()
			}

			return Bluebird.all([
				readFile(blobid),
				client.hgetallAsync("blobs:" + blobid)
			])
		})



var blobStorage = {
	reserveBlobID: function (request, meta) {
		return Bluebird.coroutine(function *() {
			yield request.session.logedinError();

			const blobid = yield createBlobID()
			const isNoMember = yield client.saddAsync("blobs:reserved", blobid);

			if (isNoMember === 1) {
				this.ne();
			} else {
				throw new Error("This should never happen...")
			}

			yield client.hmsetAsync("blobs:" + blobid, meta);

			return blobid
		})
	},
	preReserveBlobID: function () {
		return Bluebird.coroutine(function *() {
			const blobid = yield createBlobID()

			const isNoMember = yield client.saddAsync("blobs:prereserved", blobid)

			if (isNoMember === 1) {
				return blobid
			}

			throw new Error("Per logical deduction this should not have happened")
		})
	},
	fullyReserveBlobID: function (request, blobid, meta) {
		return Bluebird
			.try(() => request.session.logedinError())
			.then(() => client.sismemberAsync("blobs:prereserved", blobid))
			.then((isPreReserved) => {
				if (!isPreReserved) {
					throw new InvalidBlobID("blob not prereserved");
				}

				return Bluebird.fromCallback((cb) =>
					client.multi()
						.sadd("blobs:reserved", blobid)
						.srem("blobs:prereserved", blobid)
						.exec(cb)
				)
			})
			.then(() => client.hmsetAsync("blobs:" + blobid, meta))
			.then(() => blobid)
	},
	addBlobPart: function (request, blobid, blobPart, previousSize, lastPart) {
		return Bluebird.coroutine(function *() {
			try {
				const stats = yield Bluebird.fromCallback((cb) => fs.stat(blobIDtoFile(blobid), cb))

				if (previousSize === 0) {
					yield Bluebird.fromCallback((cb) => fs.unlink(blobIDtoFile(blobid), cb))
				}

				if (stats.size !== previousSize) {
					return true
				}
			} catch (err) {
				if (previousSize > 0) {
					return true
				}
			}

			yield  Bluebird.fromCallback((cb) => fs.appendFile(blobIDtoFile(blobid), blobPart, cb))

			if (lastPart) {
				yield Bluebird.all([
					useBlobID(blobid),
					client.saddAsync("blobs:usedids", blobid)
				])
			}

			return false
		})
	},
	addBlobFromStream: function (stream, blobid) {
		return Bluebird
			.try(() => useBlobID(blobid))
			.then((blobid) => {
				return Bluebird.fromCallback((cb) => {
					stream.on("end", cb)
					stream.pipe(fs.createWriteStream(blobIDtoFile(blobid)))
				})
			})
			.then(() => client.saddAsync("blobs:usedids", blobid))
	},
	getBlobPart: function (request, blobid, start, size) {
		return Bluebird
			.try(() => getBlobData(request, blobid))
			.then(function ([data, meta]) {
				const last = start + size >= data.length

				const result = {
					part: new Buffer(data).slice(start, start + size),
					last
				}

				if (last) {
					result.meta = meta

					if (meta && typeof meta === "object" && meta._key) {
						return request.addKey(meta._key).thenReturn(result)
					}
				}

				return result
			})
	},
	getBlob: function (request, blobid) {
		return Bluebird
			.try(() => getBlobData(request, blobid))
			.then(([data, meta]) => {
				const result = {
					blob: new Buffer(data).toString("base64"),
					meta: meta
				};

				if (meta && typeof meta === "object" && meta._key) {
					return request.addKey(meta._key).thenReturn(result)
				}

				return result
			})
	}
};

module.exports = blobStorage;
