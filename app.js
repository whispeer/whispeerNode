var io = require('socket.io').listen(3000);

io.sockets.on('connection', function (socket) {
	console.log("connection received");

	//socket.emit('news', { hello: 'world' });
	
	socket.on('login', function (data, fn) {
		console.log(data);
		fn({result: "success"});
	});
	
	socket.on('disconnect', function () {
		console.log("client disconnected");
	});
});