const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/services/aiService');

test('direct mode builds official provider URLs without proxy path prefixes', () => {
  const directConfig = {
    aiProxy: {
      enabled: false,
      baseUrl: 'https://proxy.example.com',
      token: 'proxy-token',
    },
    ai: {
      openaiBaseUrl: 'https://api.openai.com/v1',
      geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      claudeBaseUrl: 'https://api.anthropic.com/v1',
    },
  };

  assert.equal(
    __test.providerUrl('gemini', '/models/gemini-2.5-flash:generateContent?key=abc', directConfig),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=abc'
  );
  assert.equal(
    __test.providerUrl('openai', '/images/edits', directConfig),
    'https://api.openai.com/v1/images/edits'
  );
});

test('direct mode does not send Cloudflare proxy token header', () => {
  const directConfig = {
    aiProxy: {
      enabled: false,
      token: 'proxy-token',
    },
  };

  assert.deepEqual(
    __test.proxyHeaders(directConfig),
    {}
  );
});

test('proxy mode keeps existing Cloudflare proxy paths and token header', () => {
  const proxyConfig = {
    aiProxy: {
      enabled: true,
      baseUrl: 'https://api.atlanticstars.xyz',
      token: 'proxy-token',
    },
    ai: {
      openaiBaseUrl: 'https://api.openai.com/v1',
      geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      claudeBaseUrl: 'https://api.anthropic.com/v1',
    },
  };

  assert.equal(
    __test.providerUrl('gemini', '/models/gemini-2.5-flash:generateContent?key=abc', proxyConfig),
    'https://api.atlanticstars.xyz/gemini/v1beta/models/gemini-2.5-flash:generateContent?key=abc'
  );
  assert.equal(
    __test.providerUrl('openai', '/images/edits', proxyConfig),
    'https://api.atlanticstars.xyz/openai/v1/images/edits'
  );
  assert.deepEqual(
    __test.proxyHeaders(proxyConfig),
    { 'X-Proxy-Token': 'proxy-token' }
  );
});
