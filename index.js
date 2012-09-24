var server = require("./modules/server.js");
var handler = require("./handler");

/** port to listen on */
var PORT = 800;
/** start the server */
server.start(handler.handle, PORT);