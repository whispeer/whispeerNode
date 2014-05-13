var UnSavedEntity = function () {
	this._saved = false;
	this._data = {};
};

UnSavedEntity.prototype.setAttribute = function (attrs, value, cb) {
	h.assert(!this._saved);

	var field = this.getFieldName(attrs, isHash);

	if (isHash) {
		if (!this._data[field.key]) {
			this._data[field.key] = {};
		}

		this._data[field.key][field.attr] = value;
	} else {
		this._data[field.key] = value;
	}

	cb();
};

UnSavedEntity.prototype.getAttribute = function (attrs, cb, fullHash) {
	var field = this.getFieldName(attrs, fullHash);

	if (fullHash) {
		cb(null, this._data[field.key]);
	} else {
		cb(null, this._data[field.key][field.attr]);
	}
};

UnSavedEntity.prototype.unsetAttribute = function (attrs, cb, fullHash) {
	var field = this.getFieldName(attrs, fullHash);

	if (fullHash) {
		delete this._data[field.key];
	} else {
		delete this._data[field.key][field.attr];
	}
};

UnSavedEntity.prototype.save = function (domain, cb) {
	if (this._saved) {
		throw new Error("entity was already saved!");
	}

	this._saved = true;
	this._domain = domain;

	SavedEntity.call(this, domain);
};

var SavedEntity = function (domain) {
	this._saved = true;
	this._domain = domain;
};

SavedEntity.prototype.getFieldName = function (attrs, fullHash) {
	if (typeof attrs === "string") {
		attrs = attrs.split(":");
	}

	if (!fullHash) {
		var value = attrs.pop();
	}

	attrs.unshift(this._domain);

	return attrs.join(":");
};

SavedEntity.prototype.setAttribute = function (attrs, value, cb) {
	var isHash = typeof value === "object";
	var field = this.getFieldName(attrs, isHash);

	if (isHash) {
		client.hmset(field.key, value, cb);
	} else {
		client.hmset(field.key, field.attr, value, cb);
	}
};

SavedEntity.prototype.getAttribute = function (attrs, cb, fullHash) {
	var field = this.getFieldName(attrs, fullHash);

	if (fullHash) {
		client.hgetall(field.key, cb);
	} else {
		client.hget(field.key, field.attr, cb);
	}
};

SavedEntity.prototype.unsetAttribute = function (attrs, cb, fullHash) {
	var field = this.getFieldName(attrs, fullHash);
	if (fullHash) {
		client.del(field.key, cb);
	} else {
		client.hdel(field.key, field.attr, cb);
	}
};

var SaveAbleEntity = function (domain) {
	if (domain) {
		SavedEntity.call(this, domain);
	} else {
		UnSavedEntity.call(this);
	}
};

SaveAbleEntity.prototype.getFieldName = function (attrs, fullHash) {
	var value;
	if (typeof attrs === "string") {
		attrs = attrs.split(":");
	}

	if (!fullHash) {
		value = attrs.pop();
	}

	attrs.unshift(this._domain);

	return {
		key: attrs.join(":"),
		attr: value
	};
};