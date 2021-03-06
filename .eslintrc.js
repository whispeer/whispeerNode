module.exports = {
  "parser": "babel-eslint",
  "env": {
    "node": true,
    "es6": true
  },
  "parserOptions": {
    "ecmaVersion": 6
  },
  "extends": "eslint:recommended",
  "globals": {
    "StepError": true,
    "NotLogedin": true,
    "InvalidLogin": true,
    "AccessViolation": true,
    "InvalidToken": true,
    "NoBusinessLicense": true,
    "UserNotExisting": true,
    "MailInUse": true,
    "NicknameInUse": true,
    "InvalidPassword": true,
    "InvalidAttribute": true,
    "InvalidProfile": true,
    "LostDecryptor": true,
    "InvalidDecryptor": true,
    "RealIDInUse": true,
    "InvalidRealID": true,
    "NotASymKey": true,
    "InvalidSymKey": true,
    "NotAEccKey": true,
    "InvalidEccKey": true,
    "InvalidKey": true,
    "KeyNotFound": true,
    "InvalidHexError": true,
    "InvalidChunkData": true,
    "InvalidMessageData": true,
    "TopicNotExisting": true,
    "MessageNotExisting": true,
    "SuccessorError": true,
    "InvalidPost": true,
    "InvalidFilter": true,
    "InvalidCircleData": true,
    "TimeSpanExceeded": true,
    "InvalidBlobID": true,
    "BlobNotFound": true,
    "BreakPromiseChain": true,
    "CircleNotExisting": true
  },
  "rules": {
    "no-undef": 2,
    "no-bitwise": 2,
    "curly": 2,
    "eqeqeq": 2,
    "guard-for-in": 2,
    "no-extend-native": 2,
    "wrap-iife": [
      2,
      "any"
    ],
    "new-cap": 2,
    "no-caller": 2,
    "no-empty": 2,
    "no-new": 2,
    "quotes": [
      2,
      "double"
    ],
    "no-unused-vars": 2,
    "strict": [
      2,
      "safe"
    ],
    "no-use-before-define": [
      2,
      {
        "functions": false,
        "variables": false
      }
    ],
    "max-statements": 0
  }
}
