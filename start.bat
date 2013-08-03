set NODE_ENV=production

START /B /D"../main/" node ../node/webserver.js > webserver.log

START /B node app.js > log.txt