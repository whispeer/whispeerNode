"use strict";

var express = require("express");
var helmet = require("helmet");
var path = require("path");

var config = require("../main/js/config");

var basePath = path.resolve(__dirname, "../");
var appPath = "main/";
var webSocket = [config.ws + ":" + config.wsPort];

var directoryParts = ["css", "js", "img", "views", "favicon.png", "favicon.ico"];
var angular = ["user", "messages", "circles", "main", "friends", "login"];

var ws = [];

var i;
for (i = 0; i < webSocket.length; i += 1) {
  var cur = webSocket[i];
  ws.push("ws://" + cur, "http://" + cur);
}

var policy = {
  defaultPolicy: {
    "default-src": ["'self'"].concat(ws),
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"]
  }
};

helmet.csp.policy(policy);

var app = express();

app.use(function(req, res, next) {
  var urlParts = req.url.split("/");

  if (directoryParts.indexOf(urlParts[1]) === -1) {
    if (angular.indexOf(urlParts[1]) === -1) {
      console.log(req.url);
    }
    req.url = "/";
  }

  next();
});

app.use(express.methodOverride());
app.use(express.bodyParser());
app.use(helmet.csp());
app.use(helmet.xframe());
app.use(helmet.iexss());
app.use(helmet.cacheControl());

app.use(express.static(path.resolve(basePath, appPath)));

app.listen(8090);