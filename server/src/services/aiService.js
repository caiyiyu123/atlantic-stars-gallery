const config = require('../config/env');

/**
 * 通过 Cloudflare Worker 代理调用 AI 模型
 * 支持：gemini / openai / claude
 */

async function callGemini(modelName, apiKey, prompt) {
  const url = `${config.aiProxy.baseUrl}/gemini/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Proxy-Token': config.aiProxy.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

async function callOpenAI(modelName, apiKey, prompt) {
  const url = `${config.aiProxy.baseUrl}/openai/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Proxy-Token': config.aiProxy.token,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  return data?.choices?.[0]?.message?.content || '';
}

async function callClaude(modelName, apiKey, prompt) {
  const url = `${config.aiProxy.baseUrl}/claude/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Proxy-Token': config.aiProxy.token,
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  return data?.content?.[0]?.text || '';
}

async function callAI(provider, modelName, apiKey, prompt) {
  if (!config.aiProxy.baseUrl || !config.aiProxy.token) {
    throw new Error('AI 代理未配置，请检查 .env 的 AI_PROXY_BASE_URL 和 AI_PROXY_TOKEN');
  }
  switch (provider) {
    case 'gemini':
      return callGemini(modelName, apiKey, prompt);
    case 'openai':
      return callOpenAI(modelName, apiKey, prompt);
    case 'claude':
      return callClaude(modelName, apiKey, prompt);
    default:
      throw new Error(`不支持的服务商: ${provider}`);
  }
}

async function callGeminiImage(modelName, apiKey, prompt, originalImageBase64, mimeType = 'image/jpeg', aspectRatio = '') {
  const url = `${config.aiProxy.baseUrl}/gemini/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  };
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Proxy-Token': config.aiProxy.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: originalImageBase64 } }
        ]
      }],
      generationConfig,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => (p.inlineData?.data) || (p.inline_data?.data));
  if (!imgPart) {
    throw new Error('AI 未返回图片数据');
  }
  const inline = imgPart.inlineData || imgPart.inline_data;
  return {
    base64: inline.data,
    mimeType: inline.mimeType || inline.mime_type || 'image/png',
  };
}

module.exports = { callAI, callGeminiImage };
