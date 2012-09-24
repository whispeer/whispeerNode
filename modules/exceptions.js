var exceptions = {
	/** user is not existing exception */
	UserNotExisting: function (message) {
		this.toString = function () { return "User not Existing: " + this.message; };
		this.message = message;
	},
	/** exception for access violation */
	AccessException: function (message) {
		this.toString = function () { return "Access violation: " + this.message; };
		this.message = message;
	},
	/** Error which is thrown if something is not existing */
	NotExisting: function (message) {
		this.toString = function () { return "Not Existing: " + this.message; };
		this.message = message;
	},
	/** Error which is thrown if an invalid message is provided for example if no receivers are given */
	InvalidMessage: function (message) {
		this.toString = function () { return "Invalid Message: " + this.message; };
		this.message = message;
	}
};

module.exports = exceptions;