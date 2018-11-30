"use strict";

var step = require("step");
var h = require("whispeerHelper");

var blobStorage = require("../includes/blobStorage");

var streamAPI = {
	uploadBlobPart: function (data, fn, request) {
		step(function () {
			if (data.size !== (data.blobPart.byteLength || data.blobPart.length)) {
				this.last.ne({ reset: true });
				return;
			}

			blobStorage.addBlobPart(request, data.blobid, data.blobPart, data.doneBytes, data.lastPart, this);
		}, h.sF(function (reset) {
			this.ne({ reset: reset });
		}), fn);
	},
	getBlobPart: function (data, fn, request) {
		step(function () {
			blobStorage.getBlobPart(request, data.blobid, data.start, data.size, this);
		}, fn);
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
	}
};

module.exports = streamAPI;
