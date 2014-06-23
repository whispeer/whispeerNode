var step = require("step");
var h = require("whispeerHelper");

var fs = require("fs");

var client = require("./redisClient");

function isBlobID(blobid) {
	return blobid.match(/^[A-z0-9]*$/);
}

function blobIDtoFile(blobid) {
	return "files/" + blobid + ".png";
}

function checkBlobExists(blobid, cb) {
	step(function () {
		client.sismember("blobs:usedids", blobid, this);
	}, h.sF(function (ismember) {
		if (!ismember) {
			throw new BlobNotFound();
		}

		this.ne();
	}), cb);
}

function useBlobID(blobid, cb) {
	step(function () {
		if (isBlobID(blobid)) {
			client.srem("blobs:reserved", blobid, this);
		} else {
			throw new InvalidBlobID("Not a blob id " + blobid);
		}
	}, h.sF(function (removed) {
		if (removed === 1) {
			this.ne(blobid);
		} else {
			throw new InvalidBlobID("Blob ID not reserved");
		}
	}), cb);
}

var code = require("./session").code;

var BLOBIDLENGTH = 30;

function createBlobID(cb) {
	var blobid;

	step(function () {
		code(BLOBIDLENGTH, this);
	}, h.sF(function (bid) {
		blobid = bid;
		client.sadd("blobs:allids", blobid, this);
	}), h.sF(function (isMember) {
		if (isMember === 1) {
			this.ne(blobid);
		} else {
			createBlobID(cb);
		}
	}), cb);
}

var blobStorage = {
	reserveBlobID: function (view, cb) {
		var blobid;

		step(function () {
			view.session.logedinError(this);
		}, h.sF(function () {
			createBlobID(this);
		}), h.sF(function (bid) {
			blobid = bid;
			client.sadd("blobs:reserved", blobid, this);
		}), h.sF(function (isMember) {
			if (isMember === 1) {
				this.ne(blobid);
			} else {
				throw "Per logical deduction this should not have happened";
			}
		}), cb);
	},
	preReserveBlobID: function (cb) {
		var blobid;

		step(function () {
			createBlobID(this);
		}, h.sF(function (bid) {
			blobid = bid;

			client.sadd("blobs:prereserved", blobid, this);
		}), h.sF(function (isMember) {
			if (isMember === 1) {
				this.ne(blobid);
			} else {
				throw "Per logical deduction this should not have happened";
			}
		}), cb);
	},
	fullyReserveBlobID: function (view, blobid, cb) {
		step(function () {
			view.session.logedinError(this);
		}, h.sF(function () {
			client.sismember("blobs:prereserved", blobid, this);
		}), h.sF(function (isPreReserved) {
			if (isPreReserved) {
				client.multi().sadd("blobs:reserved", blobid).srem("blobs:prereserved", blobid).exec(this);
			} else {
				throw new InvalidBlobID("blob not prereserved");
			}
		}), h.sF(function () {
			this.ne(blobid);
		}), cb);
	},
	addBlobFromStream: function (stream, blobid, cb) {
		step(function () {
			useBlobID(blobid, this);
		}, h.sF(function (blobid) {
			stream.on("end", this);

			stream.pipe(fs.createWriteStream(blobIDtoFile(blobid)));
		}), h.sF(function () {
			client.sadd("blobs:usedids", blobid, this);
		}), cb);
	},
	getBlob: function (view, blobid, cb) {
		step(function () {
			view.session.logedinError(this);
		}, h.sF(function () {
			checkBlobExists(blobid, this);
		}), h.sF(function () {
			client.sismember("blobs:usedids", blobid, this);
		}), h.sF(function (exists) {
			if (exists) {
				fs.readFile(blobIDtoFile(blobid), this);
			} else {
				throw new Error("Blob not found");
			}
		}), h.sF(function (data) {
			var result = new Buffer(data).toString("base64");
			this.ne(result);
		}), cb);
	}
};

module.exports = blobStorage;