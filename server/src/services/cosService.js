const cos = require('../config/cos');
const config = require('../config/env');

function getTempCredential(allowPrefix) {
  return new Promise((resolve, reject) => {
    const policy = {
      version: '2.0',
      statement: [{
        action: ['name/cos:PutObject', 'name/cos:PostObject'],
        effect: 'allow',
        resource: [
          `qcs::cos:${config.cos.region}:uid/*:${config.cos.bucket}/${allowPrefix}*`,
        ],
      }],
    };

    const STS = require('cos-nodejs-sdk-v5/sdk/sts');
    STS.getCredential({
      secretId: config.cos.secretId,
      secretKey: config.cos.secretKey,
      durationSeconds: 1800,
      policy,
    }, (err, data) => {
      if (err) return reject(err);
      resolve({
        credentials: data.credentials,
        expiredTime: data.expiredTime,
        startTime: data.startTime,
        bucket: config.cos.bucket,
        region: config.cos.region,
      });
    });
  });
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
