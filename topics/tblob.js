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
	preReserveID: function (data, fn) {
		step(function () {
			blobStorage.preReserveBlobID(this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	fullyReserveID: function (data, fn, view) {
		step(function () {
			blobStorage.fullyReserveBlobID(view, data.blobid, this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	reserveBlobID: function (data, fn, view) {
		step(function () {
			blobStorage.reserveBlobID(view, this);
		}, h.sF(function (blobid) {
			this.ne({
				blobid: blobid
			});
		}), fn);
	},
	getBlob: function (data, fn, view) {
		step(function () {
			blobStorage.getBlob(view, data.blobid, this);
		}, h.sF(function (blob) {
			this.ne({
				blob: blob.toString("base64")
			});
		}), fn);
	},
	upgradeStream: function (data, fn, view) {
		step(function () {
			view.upgradeStream(pushBlobAPI);

			this.ne({});
		}, fn);
	}
};

module.exports = streamAPI;