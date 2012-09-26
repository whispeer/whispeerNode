var RSA = require("./rsa.js");
var sjcl = require("./sjcl.js");
var rsa = new RSA();

var BigInteger = require("./jsbn.js");

var ee = new BigInteger("10001", 16);
var n = new BigInteger("a495d0091747cc6e30bc2eb3253812ee865102ea84d8144e2be90e79526198037eba72bcdd1da395824265cc86dbdb28473fd811b284cc154a957f46bfdee85186eb497144004aee020d7f5bd399234fdae50fdd062f5184b9e78aead25c884da14ab604673d47478d14c966667fad43fa880185b00a669569fdc04b4f535b0d", 16);

var enc = rsa.encryptOAEP("abcd", ee, n, "socialize");

console.log(enc.toString(16));

var signature = new BigInteger("a40ff334abb95c48da698cbfb6c21a40d41418d4774062f907bd5d201f8fcd55f919f8b2b02846898b07401799b18b234e2221774fdcf1a656ec0c5fcba049e8d94c90407f9a8eadafcb3cfbf262b4d4fa0879dadff64116d267fabe5742532a8c5086771150cbcf358362c98b52b8986f1630a152ec4892b317ba30fc73259b", 16);

var real_hash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash("Test!"));

console.log(rsa.verifyPSS(real_hash, signature, ee, n));