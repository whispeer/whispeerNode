whispeerAPI = {
	login: function (data, fn) {
		console.log(data);
		fn({result: "success"});
	}
};

module.exports = whispeerAPI;