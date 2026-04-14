const COS = require('cos-nodejs-sdk-v5');
const config = require('./env');

const cos = new COS({
  SecretId: config.cos.secretId,
  SecretKey: config.cos.secretKey,
});

module.exports = cos;
