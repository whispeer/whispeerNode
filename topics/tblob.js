"use strict";

var step = require("step");
var h = require("whispeerHelper");

var blobStorage = require("../includes/blobStorage");

var pushBlobAPI = {
	pushBlob: function (stream, data) {
		step(function () {
			blobStorage.addBlobFromStream(stream, data.blobid, this);
		}, function (e) {
			console.log("got here!");
			console.log(e);
			//todo: socket.emit(pushBlobDone or something like that!);
		});
	},
};

var socketS = require("socket.io-stream");

var streamAPI = {
	getBlob: function (data, fn, view) {
		step(function () {
			blobStorage.getBlob(data.blobid, this);
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