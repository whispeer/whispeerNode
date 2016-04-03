"use strict";

var step = require("step");
var h = require("whispeerHelper");

var blobStorage = require("../includes/blobStorage");

var pushBlobAPI = {
	pushBlob: function (stream, data) {
		step(function () {
			blobStorage.addBlobFromStream(stream, data.blobid, this);
		}, function (e) {
			console.error(e);
			//todo: socket.emit(pushBlobDone or something like that!);
		});
	},
};

var streamAPI = {
	uploadBlobPart: function (data, fn, request) {
		step(function () {
			if (data.size !== data.blobPart.byteLength) {
				this.last.ne({ reset: true });
				return;
			}

			blobStorage.addBlobPart(request, data.blobid, data.blobPart, data.doneBytes, data.lastPart, this);
		}, h.sF(function (reset) {
			this.ne({ reset: reset });
		}), fn);
	},
	preReserveID: function (data, fn) {
		step(function () {
			blobStorage.preReserveBlobID(this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	fullyReserveID: function (data, fn, request) {
		step(function () {
			blobStorage.fullyReserveBlobID(request, data.blobid, data.meta, this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	reserveBlobID: function (data, fn, request) {
		step(function () {
			blobStorage.reserveBlobID(request, data.meta, this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	getBlob: function (data, fn, request) {
		step(function () {
			blobStorage.getBlob(request, data.blobid, this);
		}, h.sF(function (result) {
			this.ne(result);
		}), fn);
	},
	upgradeStream: function (data, fn, request) {
		step(function () {
			request.socketData.upgradeStream(pushBlobAPI);

			this.ne({});
		}, fn);
	}
};

module.exports = streamAPI;
