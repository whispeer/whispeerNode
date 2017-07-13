"use strict";

var h = require("whispeerHelper");
var step = require("step");

var client = require("./redisClient");

var Bluebird = require("bluebird")

function SavedEntity(domain) {
	this._saved = true;
	this._domain = domain;

	this._executeHooks = function (hook, attrs, data, cb) {
		var that = this;

		step(function () {
			var cur = that._validation;

			attrs.forEach(function (attr) {
				if (cur) {
					cur = cur[attr];
				}

				if (cur && cur[hook]) {
					cur[hook](data, this.parallel());
				}
			}, this);

			if (typeof data.value === "object" && cur) {
				h.objectEach(data.value, function (attr, value) {
					if (cur[attr] && cur[attr][hook]) {
						cur[attr][hook]({
							reference: data.reference,
							request: data.request,
							key: data.key,
							value: value
						}, this.parallel());
					}
				}, this);
			}

			this.parallel()();
		}, cb);
	};

	this._transform = function (hook, attrs, data, cb) {
		var cur = this._validation, hookF;

		attrs.forEach(function (attr) {
			if (cur) {
				cur = cur[attr];
			}

			if (cur) {
				hookF = cur[hook] || hookF;
			}
		});

		//TODO: transform objects of value!

		if (hookF) {
			hookF(data, cb);
		} else {
			cb(null, data.value);
		}
	};

	this.setAttribute = function(request, attrs, value, cb) {
		h.assert(this._saved || this._saving);

		var that = this;
		var fieldAttrs = this.getAttributes(attrs);

		var data = {
			reference: this._reference,
			request: request,
			key: fieldAttrs,
			value: value
		};

		var field;
		step(function() {
			that.getAttribute(request, attrs, this);
		}, h.sF(function (oldValue) {
			data.oldValue = oldValue;

			that._transform("transform", fieldAttrs, data, this);
		}), h.sF(function (newValue) {
			value = newValue || value;
			data.value = value;

			that._executeHooks("pre", fieldAttrs, data, this);
		}), h.sF(function() {
			var isHash = (typeof value === "object" && value.constructor === Object);
			field = that.getFieldName(attrs, isHash);

			if (isHash) {
				client.multi().del(field.key).hmset(field.key, value).exec(this);
			} else {
				client.hmset(field.key, field.attr, value, this);
			}
		}), h.sF(function() {
			that._executeHooks("post", fieldAttrs, data, this);
		}), h.sF(function () {
			that.emit("setAttribute", request, field, data);

			this.ne(true);
		}), cb);
	};

	this.getAttribute = function(request, attrs, cb, fullHash) {
		h.assert(this._saved || this._saving);

		var that = this;

		var field = this.getFieldName(attrs, fullHash);
		var data = {
			reference: this._reference,
			request: request,
			key: field.attrs
		};

		step(function() {
			that._executeHooks("read", field.attrs, data, this);
		}, h.sF(function () {
			if (fullHash) {
				return client.hgetallAsync(field.key);
			} else {
				return client.hgetAsync(field.key, field.attr);
			}
		}), h.sF(function (value) {
			data.value = value;

			that._transform("readTransform", field.attrs, data, this);
		}), cb);
	};

	this.unsetAttribute = function(request, attrs, cb, fullHash) {
		h.assert(this._saved || this._saving);

		var field = this.getFieldName(attrs, fullHash);
		if (fullHash) {
			client.del(field.key, cb);
		} else {
			client.hdel(field.key, field.attr, cb);
		}

		this.emit("unsetAttribute", field);
	};
}

function UnSavedEntity() {
	this._saved = false;
	this._data = {};

	this.setAttribute = function(request, attrs, value, cb) {
		h.assert(!this._saved);

		var isHash = (typeof value === "object" && value.constructor === Object);
		var field = this.getFieldName(attrs, isHash);

		if (isHash) {
			this._data[field.key] = value;
		} else {
			if (!this._data[field.key]) {
				this._data[field.key] = {};
			}

			this._data[field.key][field.attr] = value;
		}

		return Bluebird.resolve().nodeify(cb)
	};

	this.getAttribute = function(request, attrs, cb, fullHash) {
		h.assert(!this._saved);

		var field = this.getFieldName(attrs, fullHash);

		if (fullHash) {
			return Bluebird.resolve(this._data[field.key]).nodeify(cb)
		} else {
			return Bluebird.resolve(this._data[field.key][field.attr]).nodeify(cb)
		}
	};

	this.unsetAttribute = function(request, attrs, cb, fullHash) {
		h.assert(!this._saved);

		var field = this.getFieldName(attrs, fullHash);

		if (fullHash) {
			delete this._data[field.key];
		} else {
			delete this._data[field.key][field.attr];
		}
	};

	this.save = function(request, domain, cb) {
		h.assert(!this._saved);

		var that = this;

		SavedEntity.call(this, domain);
		that._saved = false;
		that._saving = true;

		step(function() {
			h.objectEach(that._data, function(key, value) {
				that.setAttribute(request, key, value, this.parallel());
			}, this);
		}, h.sF(function () {
			that.emit("afterSavedHook", request);

			that._saved = true;
			that._saving = false;

			this.ne();
		}), cb);
	};
}

function SaveAbleEntity(validation, reference, domain) {
	this._validation = validation;
	this._reference = reference;

	if (domain) {
		SavedEntity.call(this, domain);
	} else {
		UnSavedEntity.call(this);
	}

	this.getAttributes = function (attrs) {
		if (typeof attrs === "string") {
			attrs = attrs.split(":");
		}

		if (attrs.length === 1 && attrs[0] === "") {
			attrs = [];
		}

		return attrs;
	};

	this.getFieldName = function(attrs, fullHash) {
		var value;
		attrs = this.getAttributes(attrs);

		var givenAttrs = attrs.slice();

		if (!fullHash) {
			value = attrs.pop();
		}

		if (this._saved || this._saving) {
			attrs.unshift(this._domain);
		}

		return {
			key: attrs.join(":"),
			attr: value,
			attrs: givenAttrs
		};
	};

	this.isSaved = function() {
		return this._saved;
	};
}

var util = require("util");
var EventEmitter = require("events").EventEmitter;
util.inherits(SaveAbleEntity, EventEmitter);

module.exports = SaveAbleEntity;
