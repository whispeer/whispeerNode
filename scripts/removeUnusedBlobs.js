#!/usr/bin/env node

/* eslint-disable no-console */

"use strict";

const Bluebird = require("bluebird");
const _ = require("lodash");
Bluebird.longStackTraces();

const setup = require("../includes/setup");
const client = require("../includes/redisClient");
const Message = require("../includes/models/message")

const setupP = Bluebird.promisify(setup);

const PAGE_SIZE = 5000;

const fileBlobs = (files) => {
	if (!files) {
		return [];
	}

	return files.map(({ blobID }) => blobID);
};
const imageBlobs = (images) => {
	if (!images) {
		return [];
	}

	const imageSizes = _.flatten(images
		.map(({ lowest, highest, middle }) => [lowest, highest, middle])
	)

	return imageSizes
		.filter((v) => !!v)
		.map(({ blobID }) => blobID);
};
const voiceBlobs = (voices) => {
	if (!voices) {
		return [];
	}

	return voices.map(({ blobID }) => blobID);
};

const getMessageBlobIds = async (page) => {
	const messages = await Message.findAll({
		offset: page.offset,
		limit: PAGE_SIZE,
	});

	return _.flatten(messages
		.map((m) => m.getMeta())
		.filter((meta) => {
			if (meta.files && meta.files.length > 0) {
				return true;
			}

			if (meta.images && meta.images.length > 0) {
				return true;
			}

			if (meta.voicemails && meta.voicemails.length > 0) {
				return true;
			}

			return false;
		}).map((meta) => {
			const { images, voicemails, files } = meta;

			return [...fileBlobs(files), ...imageBlobs(images), ...voiceBlobs(voicemails)];
		}));
}

Bluebird.try(async () => {
	await setupP();

	const messages = await Message.count();

	const pages = [];

	for (let i = 0; i < messages; i += PAGE_SIZE) {
		pages.push({ offset: i })
	}

	console.time("getMessageBlobIds")
	const blobIds = await Bluebird.map(pages, (page) => getMessageBlobIds(page), { concurrency: 2 });
	console.timeEnd("getMessageBlobIds")

	console.log(_.flatten(blobIds).length);
}).then(function () {
  process.exit();
});
