"use strict";

const blobStorage = require("../includes/blobStorage");
const Bluebird = require("bluebird")

const pushBlobAPI = {
	pushBlob: function (stream, data) {
		//todo: socket.emit(pushBlobDone or something like that!);
		return blobStorage.addBlobFromStream(stream, data.blobid)
			.catch((e) => console.error(e))
	},
};

const streamAPI = {
	uploadBlobPart: function (data, fn, request) {
		return Bluebird.try(() => {
			if (data.size !== (data.blobPart.byteLength || data.blobPart.length)) {
				return true;
			}

			return blobStorage.addBlobPart(request, data.blobid, data.blobPart, data.doneBytes, data.lastPart);
		})
		.then((reset) => ({ reset }))
		.nodeify(fn)
	},
	getBlobPart: function (data, fn, request) {
		return blobStorage
			.getBlobPart(request, data.blobid, data.start, data.size)
			.nodeify(fn)
	},
	preReserveID: function (data, fn) {
		return blobStorage
			.preReserveBlobID()
			.then((blobid) => ({ blobid }))
			.nodeify(fn)
	},
	fullyReserveID: function (data, fn, request) {
		return blobStorage
			.fullyReserveBlobID(request, data.blobid, data.meta)
			.then((blobid) => ({ blobid }))
			.nodeify(fn);
	},
	reserveBlobID: function (data, fn, request) {
		return blobStorage
			.reserveBlobID(request, data.meta)
			.then((blobid) => ({ blobid }))
			.nodeify(fn)
	},
	getBlob: function (data, fn, request) {
		return blobStorage
			.getBlob(request, data.blobid)
			.nodeify(fn)
	},
	upgradeStream: function (data, fn, request) {
		return Bluebird.try(() => {
			request.socketData.upgradeStream(pushBlobAPI);

			return {}
		}).nodeify(fn)
	}
};

module.exports = streamAPI;
