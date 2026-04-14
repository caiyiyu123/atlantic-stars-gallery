const cos = require('../config/cos');
const config = require('../config/env');

async function getTempCredential(allowPrefix) {
  const STS = require('qcloud-cos-sts');
  const result = await STS.getCredential({
    secretId: config.cos.secretId,
    secretKey: config.cos.secretKey,
    durationSeconds: 1800,
    policy: {
      version: '2.0',
      statement: [{
        effect: 'allow',
        action: ['name/cos:PutObject', 'name/cos:PostObject'],
        resource: [`qcs::cos:${config.cos.region}:uid/${config.cos.appId}:${config.cos.bucket}/*`],
      }],
    },
  });
  return {
    credentials: result.credentials,
    expiredTime: result.expiredTime,
    startTime: result.startTime,
    bucket: config.cos.bucket,
    region: config.cos.region,
  };
}

function getSignedUrl(key) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: key,
      Sign: true,
      Expires: 3600,
    }, (err, data) => {
      if (err) return reject(err);
      resolve(data.Url);
    });
  });
}

function getObject(key) {
  return new Promise((resolve, reject) => {
    cos.getObject({
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: key,
    }, (err, data) => {
      if (err) return reject(err);
      resolve(data.Body);
    });
  });
}

function deleteObject(key) {
  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: key,
    }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

function getThumbnailUrl(originalUrl) {
  return `${originalUrl}?imageView2/1/w/400/h/400`;
}

module.exports = { getTempCredential, getSignedUrl, getObject, deleteObject, getThumbnailUrl };
