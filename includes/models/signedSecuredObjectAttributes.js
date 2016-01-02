"use strict";

module.exports = {
	_version: {
		type: "integer",
		min: 1,
		required: true
	},
	_type: {
		type: "string",
		required: true
	},
	_contentHash: {
		type: "string",
		hex: true
	},
	_ownHash: {
		type: "string",
		hex: true
	},
	_hashVersion: {
		type: "integer",
		required: true,
	},
	_signature: {
		type: "string",
		hex: true,
		required: true
	}
};
