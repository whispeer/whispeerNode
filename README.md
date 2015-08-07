whispeer
========

## Initial installation:

* git clone <repo-url>
* npm install
* Install redis on your machine

## For Developing purposes:

* git pull
* git submodule update --init
* npm install
* node app.js


## Enabling push

* Install mongodb on your machine (hopefully this won't be necessary soon)
* npm install node-pushserver -g
* Copy pushServerConfig.conf.json.example to pushServerConfig.conf.json and add api-key/certificate
* pushserver -c pushServerConfig.conf.json
