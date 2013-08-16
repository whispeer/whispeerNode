"use strict";

var express = require("express");
var helmet = require("helmet");

//default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'

var policy = {
  defaultPolicy: {
    "default-src": ["'self'", "ws://127.0.0.1:3000", "http://127.0.0.1:3000", "ws://192.168.0.4:3000", "http://192.168.0.4:3000", "http://192.168.178.40:3000", "ws://192.168.178.40:3000"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": ["'self'"],
    "img-src": ["'self'", "data:"]
  }
};

helmet.csp.policy(policy);

var app2 = express();

app2.use(express.methodOverride());
app2.use(express.bodyParser());
app2.use(helmet.csp());
app2.use(helmet.xframe());
app2.use(helmet.iexss());
app2.use(helmet.cacheControl());

app2.use(express.static("../app2directory-build/"));

app2.listen(8088);

var app = express();

app.use(express.methodOverride());
app.use(express.bodyParser());
app.use(helmet.csp());
app.use(helmet.xframe());
app.use(helmet.iexss());
app.use(helmet.cacheControl());

app.use(express.static("../main/"));

app.listen(80);