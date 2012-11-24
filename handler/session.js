"use strict";
var logger = require("../modules/logger.js").logger;
var step = require("step");
var userManager = require("../modules/userManager.js");
var h = require("../modules/helper.js").helper;

/** Session Management Topic.
* everything that is related to 
* session management is put under this api topic.
*/
var session = {
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
};

module.exports = session;