"use strict";
var logger = require("./modules/logger.js").logger;
var step = require("step");
var userManager = require("./modules/userManager.js");
var h = require("./modules/helper.js").helper;

/** This is the Whispeer API.
* @result logedin:boolean are you currently logged in?
*/
var whispeerAPI = {
	/** Session Management Topic.
	* everything that is related to 
	* session management is put under this api topic.
	*/
	session: {
		/** log in
		* @param identifier user identifier (mail or nickname)
		* @param password user password
		* @result loginok:boolean did login succeed?
		* @result mainKey:symKey users main encryption key
		* @result key:rsaKey users private key
		* @result sid:String session ID.
		*/
		login: function (readyFunction, view) {
			var actionData = view.getData();

			logger.log("login!", logger.NOTICE);
			step(function testLogin() {
				view.getSession().login(actionData.identifier, actionData.password, this);
			}, h.sF(function loginOK(result) {
				view.setValue("loginok", result);
				view.setValue("logedin", result);
				if (result === true) {
					view.setValue("sid", view.getSession().getSID());
					var ownUser;
					step(function getUser() {
						view.getSession().getOwnUser(this);
					}, function theUser(err, user) {
						if (err) {
							//something went terribly wrong!
							logger.log("Fatal Error! Logged In User Not Existing Any More", logger.ERROR);
							throw err;
						}

						ownUser = user;
						ownUser.getMainKey(this, view);
					}, h.sF(function (mainKey) {
						view.setValue("mainKey", mainKey);
						ownUser.getPrivateKey(this, view);
					}), h.sF(function (privateKey) {
						view.setValue("key", privateKey);
						this(null);
					}), readyFunction);
				} else {
					this(null);
				}
			}), readyFunction);
		},
		register: function (readyFunction, view) {

		},
		/** log out the currently loged in user
		* @param sid:String session id
		* @result logedin:boolean should be 0/false
		*/
		logout: function (readyFunction, view) {
			step(function doLogout() {
				view.getSession().logout(this);
			}, h.sF(function logedOut() {
				view.setValue("logedin", false);
			}), readyFunction);
		}
	}
};

/*var handle = {};
handle.login = handler.session.login;
handle.register = handler.session.register;
handle.logout = handler.session.logout;/*

handle["checkMail"] = handler.helper.checkMail;
handle["checkNickname"] = handler.helper.checkNickname;
handle["checkSession"] = handler.helper.checkSession;

handle["publicKey"] = handler.key.publicKey;
handle["sessionKey"] = handler.key.sessionKey;

handle["friendShip"] = handler.user.friendShip;
handle["friends"] = handler.user.friends;
handle["friendShipRequests"] = handler.user.friendShipRequests;
handle["friendShipRequested"] = handler.user.friendShipRequested;

handle["search"] = handler.user.search;

handle["sendMessage"] = handler.messages.sendMessage;
handle["messages"] = handler.messages.handler;

handle["userProfile"] = handler.user.userProfile;
handle["setPublicProfile"] = handler.user.setPublicProfile;
handle["setPrivateProfile"] = handler.user.setPrivateProfile;

handle["getSymAsymKey"] = handler.getSymAsymKey;
handle["setSymAsymKey"] = handler.key.setSymAsymKey;
handle["setKey"] = handler.key.setKey;*/

exports.handle = whispeerAPI;