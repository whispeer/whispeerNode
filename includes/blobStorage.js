"use strict";

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
	}), h.sF(function (isNoMember) {
		if (isNoMember === 1) {
			this.ne(blobid);
		} else {
			createBlobID(cb);
		}
	}), cb);
}

var readFile = function (blobid, cb) {
	step(function () {
		fs.readFile(blobIDtoFile(blobid), this);
	}, function (err, file) {
		if (!err) {
			return this.ne(file)
		}

		console.log(err)
		throw new BlobNotFound();
	}, cb)
}

var getBlobData = function (request, blobid, cb) {
	step(function () {
		request.session.logedinError(this);
	}, h.sF(function () {
		checkBlobExists(blobid, this);
	}), h.sF(function () {
		client.sismember("blobs:usedids", blobid, this);
	}), h.sF(function (exists) {
		if (exists) {
			this.parallel.unflatten();
			readFile(blobid, this.parallel())
			client.hgetall("blobs:" + blobid, this.parallel());
		} else {
			throw new BlobNotFound();
		}
	}), cb);
}

var blobStorage = {
	reserveBlobID: function (request, meta, cb) {
		var blobid;

		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			createBlobID(this);
		}), h.sF(function (bid) {
			blobid = bid;
			client.sadd("blobs:reserved", blobid, this);
		}), h.sF(function (isNoMember) {
			if (isNoMember === 1) {
				this.ne();
			} else {
				throw "Per logical deduction this should not have happened";
			}
		}), h.sF(function () {
			client.hmset("blobs:" + blobid, meta, this);
		}), h.sF(function () {
			this.ne(blobid);
		}), cb);
	},
	preReserveBlobID: function (cb) {
		var blobid;

		step(function () {
			createBlobID(this);
		}, h.sF(function (bid) {
			blobid = bid;

			client.sadd("blobs:prereserved", blobid, this);
		}), h.sF(function (isNoMember) {
			if (isNoMember === 1) {
				this.ne(blobid);
			} else {
				throw "Per logical deduction this should not have happened";
			}
		}), cb);
	},
	fullyReserveBlobID: function (request, blobid, meta, cb) {
		step(function () {
			request.session.logedinError(this);
		}, h.sF(function () {
			client.sismember("blobs:prereserved", blobid, this);
		}), h.sF(function (isPreReserved) {
			if (isPreReserved) {
				client.multi().sadd("blobs:reserved", blobid).srem("blobs:prereserved", blobid).exec(this);
			} else {
				throw new InvalidBlobID("blob not prereserved");
			}
		}), h.sF(function () {
			client.hmset("blobs:" + blobid, meta, this);
		}), h.sF(function () {
			this.ne(blobid);
		}), cb);
	},
	addBlobPart: function (request, blobid, blobPart, previousSize, lastPart, cb) {
		step(function () {
			fs.stat(blobIDtoFile(blobid), this);
		}, function (err, stats) {
			if (err) {
				if (previousSize > 0) {
					this.last.ne(true);
				} else {
					this.ne();
				}

				return;
			}

			if (previousSize === 0) {
				fs.unlink(blobIDtoFile(blobid), this);
				return;
			}

			if (stats.size !== previousSize) {
				this.last.ne(true);
				return;
			}

			this.ne();
		}, h.sF(function () {
			fs.appendFile(blobIDtoFile(blobid), blobPart, this);
		}), h.sF(function () {
			if (lastPart) {
				useBlobID(blobid, this.parallel());
				client.sadd("blobs:usedids", blobid, this.parallel());
			} else {
				this.ne();
			}
		}), h.sF(function () {
			this.ne(false);
		}), cb);
	},
	getBlobPart: function (request, blobid, start, size, cb) {
		var result;
		step(function () {
			getBlobData(request, blobid, this);
		}, h.sF(function (data, meta) {
			const last = start + size >= data.length

			result = {
				part: new Buffer(data).slice(start, start + size),
				last
			}

			if (last) {
				result.meta = meta

				if (meta && typeof meta === "object" && meta._key) {
					request.addKey(meta._key, this)
					return
				}
			}

			this.ne();
		}), h.sF(function () {
			return result
		}), cb)
	},
	getBlob: function (request, blobid, cb) {
		var result;
		step(function () {
			getBlobData(request, blobid, this);
		}, h.sF(function (data, meta) {
			result = {
				blob: new Buffer(data).toString("base64"),
				meta: meta
			};

			if (meta && typeof meta === "object" && meta._key) {
				request.addKey(meta._key, this);
				return
			}

			this.ne();
		}), h.sF(function () {
			this.ne(result);
		}), cb);
	}
};

module.exports = blobStorage;
