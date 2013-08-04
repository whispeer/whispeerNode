"use strict";

var connect = require('connect'),
    http = require('http');

connect()
    .use(connect.static('../main/'))
    .listen(80);