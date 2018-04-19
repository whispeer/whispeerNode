"use strict"

const h = require("whispeerHelper")
const Bluebird = require("bluebird")

const client = require("./redisClient")

const runAttributeHooks = (hook, attrs, data, validations) =>
	Bluebird.resolve(
		attrs
			.filter((attr) => validations[attr] && validations[attr][hook])
			.map((attr) => validations[attr][hook](data))
	)

const runDataHooks = (hook, data, validations) => {
	if (typeof data.value !== "object") {
		return Bluebird.resolve()
	}

	const {
		reference,
		request,
		key,
		value
	} = data

	return Bluebird.all(
		Object.keys(data.value)
			.filter((attr) => validations[attr] && validations[attr][hook])
			.map((attr) => validations[attr][hook]({ reference, request, key, value: value[attr] }))
	)
}

function SavedEntity(domain) {
	this._saved = true
	this._domain = domain

	this._executeHooks = function (hook, attrs, data) {
		return Bluebird.all([
			runAttributeHooks(hook, attrs, data, this._validation),
			runDataHooks(hook, data, this._validation)
		])
	}

	this._transform = function (hook, attrs, data) {
		var cur = this._validation, hookF

		attrs.forEach(function (attr) {
			if (cur) {
				cur = cur[attr]
			}

			if (cur) {
				hookF = cur[hook] || hookF
			}
		})

		//TODO: transform objects of value!

		if (hookF) {
			return hookF(data)
		}

		return Bluebird.resolve(data.value)
	}

	this.setAttribute = function(request, attrs, value, cb) {
		h.assert(this._saved || this._saving)

		const fieldAttrs = this.getAttributes(attrs)

		return Bluebird.coroutine(function *() {
			const oldValue = yield this.getAttribute(request, attrs)

			const data = {
				reference: this._reference,
				request,
				key: fieldAttrs,
				value,
				oldValue
			}

			const newValue = yield this._transform("transform", fieldAttrs, data)

			value = newValue || value
			data.value = value

			yield this._executeHooks("pre", fieldAttrs, data)

			const isHash = (typeof value === "object" && value.constructor === Object)
			const field = this.getFieldName(attrs, isHash)

			if (isHash) {
				yield Bluebird.fromCallback(cb => client.multi().del(field.key).hmset(field.key, value).exec(cb))
			} else {
				yield client.hmsetAsync(field.key, field.attr, value)
			}

			yield this._executeHooks("post", fieldAttrs, data)

			this.emit("setAttribute", request, field, data)

			return true
		}).nodeify(cb)
	}

	this.getAttribute = function(request, attrs, cb, fullHash) {
		h.assert(this._saved || this._saving)

		const field = this.getFieldName(attrs, fullHash)
		const data = {
			reference: this._reference,
			request,
			key: field.attrs
		}

		return this._executeHooks("read", field.attrs, data)
			.then(() => fullHash ? client.hgetallAsync(field.key) : client.hgetAsync(field.key, field.attr))
			.then((value) => this._transform("readTransform", field.attrs, Object.assign({ value }, data)))
			.nodeify(cb)
	}

	this.unsetAttribute = function(request, attrs, cb, fullHash) {
		h.assert(this._saved || this._saving)

		const field = this.getFieldName(attrs, fullHash)

		this.emit("unsetAttribute", field)

		if (fullHash) {
			return client.delAsync(field.key).nodeify(cb)
		}

		return client.hdelAsync(field.key, field.attr).nodeify(cb)
	}
}

function UnSavedEntity() {
	this._saved = false
	this._data = {}

	this.setAttribute = function(request, attrs, value, cb) {
		h.assert(!this._saved)

		var isHash = (typeof value === "object" && value.constructor === Object)
		var field = this.getFieldName(attrs, isHash)

		if (isHash) {
			this._data[field.key] = value
		} else {
			if (!this._data[field.key]) {
				this._data[field.key] = {}
			}

			this._data[field.key][field.attr] = value
		}

		return Bluebird.resolve().nodeify(cb)
	}

	this.getAttribute = function(request, attrs, cb, fullHash) {
		h.assert(!this._saved)

		var field = this.getFieldName(attrs, fullHash)

		if (fullHash) {
			return Bluebird.resolve(this._data[field.key]).nodeify(cb)
		} else {
			return Bluebird.resolve(this._data[field.key][field.attr]).nodeify(cb)
		}
	}

	this.unsetAttribute = function(request, attrs, cb, fullHash) {
		h.assert(!this._saved)

		var field = this.getFieldName(attrs, fullHash)

		if (fullHash) {
			delete this._data[field.key]
		} else {
			delete this._data[field.key][field.attr]
		}
	}

	this.save = function(request, domain, cb) {
		h.assert(!this._saved)

		SavedEntity.call(this, domain)
		this._saved = false
		this._saving = true

		return Bluebird.try(() =>
			Bluebird.all(
				Object.keys(this._data)
				.map((key) => this.setAttribute(request, key, this._data[key]))
			)
		).then(() => {
			this.emit("afterSavedHook", request)

			this._saved = true
			this._saving = false
		}).nodeify(cb)
	}
}

function SaveAbleEntity(validation, reference, domain) {
	this._validation = validation
	this._reference = reference

	if (domain) {
		SavedEntity.call(this, domain)
	} else {
		UnSavedEntity.call(this)
	}

	this.getAttributes = function (attrs) {
		if (typeof attrs === "string") {
			attrs = attrs.split(":")
		}

		if (attrs.length === 1 && attrs[0] === "") {
			attrs = []
		}

		return attrs
	}

	this.getFieldName = function(attrs, fullHash) {
		var value
		attrs = this.getAttributes(attrs)

		var givenAttrs = attrs.slice()

		if (!fullHash) {
			value = attrs.pop()
		}

		if (this._saved || this._saving) {
			attrs.unshift(this._domain)
		}

		return {
			key: attrs.join(":"),
			attr: value,
			attrs: givenAttrs
		}
	}

	this.isSaved = function() {
		return this._saved
	}
}

var util = require("util")
var EventEmitter = require("events").EventEmitter
util.inherits(SaveAbleEntity, EventEmitter)

module.exports = SaveAbleEntity
