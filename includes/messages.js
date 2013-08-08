var Topic = function (id) {

}

var Message = function (id) {

}

Message.create = function (data) {
	step(function () {
		validator.validateEncrypted("message", data);
	})
}