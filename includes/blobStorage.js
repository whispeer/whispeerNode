var step = require("step");
var h = require("whispeerHelper");

var fs = require("fs");

function isBlobID(blobid) {
	return h.isHex(blobid);
}

function blobIDtoFile(blobid) {
	return "files/" + blobid + ".png";
}

function checkBlobExists(blobid, cb) {
	cb();
}

function useBlobID(blobid, cb) {
	if (isBlobID(blobid)) {
		/*
			if blobid is reserved
				save blob for blobid
			else
				throw
		*/
		cb(null, blobid);
	} else {
		cb("NOP!");
	}
}

var blobStorage = {
	addBlobFromStream: function (stream, blobid, cb) {
		step(function () {
			useBlobID(blobid, this);
		}, h.sF(function (blobid) {
			stream.on("end", this);

			stream.pipe(fs.createWriteStream(blobIDtoFile(blobid)));
		}), cb);
	},
	getBlob: function (blobid, cb) {
		var result = "";

		step(function () {
			checkBlobExists(blobid, this);
		}, h.sF(function () {
			var stream = fs.createReadStream(blobIDtoFile(blobid));

			var base64Stream = require("base64Stream");

			var bstream = new base64Stream.BufferedStreamToBase64();
			stream.pipe(bstream);

			bstream.on("data", function (d) {result += d;});
			bstream.on("end", this);
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	}
};

module.exports = blobStorage;