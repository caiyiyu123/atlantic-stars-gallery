const config = require('../config/env');

/**
 * 通过 Cloudflare Worker 代理调用 AI 模型
 * 支持：gemini / openai / claude
 */

const FETCH_TIMEOUT_MS = 180000; // 3 分钟（图像生成可能很慢）
const MAX_RETRIES = 2;            // 网络错误最多重试 2 次（共 3 次尝试）
const RETRY_DELAY_MS = 3000;      // 重试间隔 3 秒

const PROXY_PROVIDER_PREFIX = {
  gemini: '/gemini/v1beta',
  openai: '/openai/v1',
  claude: '/claude/v1',
};

const DIRECT_PROVIDER_BASE = {
  gemini: 'geminiBaseUrl',
  openai: 'openaiBaseUrl',
  claude: 'claudeBaseUrl',
};

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
}

function usingProxy(cfg = config) {
  return Boolean(cfg.aiProxy?.enabled);
}

function proxyHeaders(cfg = config) {
  return usingProxy(cfg) ? { 'X-Proxy-Token': cfg.aiProxy.token } : {};
}

function providerUrl(provider, path, cfg = config) {
  if (usingProxy(cfg)) {
    return joinUrl(cfg.aiProxy.baseUrl, `${PROXY_PROVIDER_PREFIX[provider] || ''}${path}`);
  }
  const baseKey = DIRECT_PROVIDER_BASE[provider];
  return joinUrl(cfg.ai?.[baseKey], path);
}

function ensureProviderConfig(provider) {
  if (usingProxy()) {
    if (!config.aiProxy.baseUrl || !config.aiProxy.token) {
      throw new Error('AI proxy is not configured. Set AI_PROXY_BASE_URL and AI_PROXY_TOKEN, or set AI_USE_PROXY=false for direct provider APIs.');
    }
    return;
  }
  const baseKey = DIRECT_PROVIDER_BASE[provider];
  if (!baseKey || !config.ai?.[baseKey]) {
    throw new Error(`AI provider base URL is not configured for ${provider}.`);
  }
}

function describeFetchError(err) {
  const msg = err?.message || '未知错误';
  const cause = err?.cause;
  if (cause?.code) return `${msg} (${cause.code})`;
  if (cause?.message) return `${msg} (${cause.message.slice(0, 80)})`;
  return msg;
}

function getApiErrorMessage(data, fallback) {
  return data?.error?.message || data?.message || fallback;
}

async function readJsonResponse(res, upstreamName) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (err) {
    const contentType = res.headers.get('content-type') || '';
    const snippet = text.replace(/\s+/g, ' ').slice(0, 180);
    if (res.status === 524) {
      throw new Error(`${upstreamName} 代理请求超时：HTTP 524。通常是 Cloudflare 代理等待上游响应超过约 120 秒；请重试，或改用更小的输入图/更快的模型。`);
    }
    throw new Error(`${upstreamName} 返回了非 JSON 响应：HTTP ${res.status} ${contentType}${snippet ? `；内容片段：${snippet}` : ''}`);
  }
}

async function fetchWithRetry(url, options) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const opts = { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
      return await fetch(url, opts);
    } catch (err) {
      lastErr = err;
      // AbortError（超时）也归入重试
      const desc = describeFetchError(err);
      if (attempt < MAX_RETRIES) {
        console.warn(`[fetchWithRetry] 第 ${attempt + 1} 次失败：${desc}，${RETRY_DELAY_MS}ms 后重试...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      } else {
        console.error(`[fetchWithRetry] 全部 ${MAX_RETRIES + 1} 次都失败：${desc}`);
      }
    }
  }
  throw new Error(`网络请求失败: ${describeFetchError(lastErr)}`);
}

async function callGemini(modelName, apiKey, prompt) {
  const url = providerUrl('gemini', `/models/${modelName}:generateContent?key=${apiKey}`);
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...proxyHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const data = await readJsonResponse(res, 'Gemini');
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

async function callOpenAI(modelName, apiKey, prompt) {
  const url = providerUrl('openai', '/chat/completions');
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...proxyHeaders(),
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await readJsonResponse(res, 'OpenAI');
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
  }
  return data?.choices?.[0]?.message?.content || '';
}

async function callClaude(modelName, apiKey, prompt) {
  const url = providerUrl('claude', '/messages');
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...proxyHeaders(),
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
  const data = await readJsonResponse(res, 'Claude');
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
  }
  return data?.content?.[0]?.text || '';
}

async function callAI(provider, modelName, apiKey, prompt) {
  ensureProviderConfig(provider);
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
  const url = providerUrl('gemini', `/models/${modelName}:generateContent?key=${apiKey}`);
  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  };
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...proxyHeaders(),
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
  const data = await readJsonResponse(res, 'Gemini');
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
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

function extFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function openAIImageSize(aspectRatio) {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024';
    case '4:3':
      return '1536x1024';
    case '3:4':
      return '1024x1536';
    default:
      return 'auto';
  }
}

async function callOpenAIImage(modelName, apiKey, prompt, originalImageBase64, mimeType = 'image/jpeg', aspectRatio = '') {
  const url = providerUrl('openai', '/images/edits');
  const imageBuffer = Buffer.from(originalImageBase64, 'base64');
  const form = new FormData();
  form.append('model', modelName);
  form.append('prompt', prompt);
  form.append('image[]', new Blob([imageBuffer], { type: mimeType }), `input.${extFromMime(mimeType)}`);
  form.append('size', openAIImageSize(aspectRatio));
  form.append('quality', 'auto');
  form.append('background', 'opaque');
  form.append('output_format', 'png');

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...proxyHeaders(),
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  });
  const data = await readJsonResponse(res, 'OpenAI');
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
  }
  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error('OpenAI 未返回图片数据');
  }
  return { base64, mimeType: 'image/png' };
}

async function callImage(provider, modelName, apiKey, prompt, originalImageBase64, mimeType = 'image/jpeg', aspectRatio = '') {
  ensureProviderConfig(provider);
  switch (provider) {
    case 'gemini':
      return callGeminiImage(modelName, apiKey, prompt, originalImageBase64, mimeType, aspectRatio);
    case 'openai':
      return callOpenAIImage(modelName, apiKey, prompt, originalImageBase64, mimeType, aspectRatio);
    default:
      throw new Error(`服务商 ${provider} 暂不支持图像生成`);
  }
}

/**
 * 轻量连通性测试（不消耗配额）
 * 通过各家的 list models 接口验证 API Key 与代理可达
 */
async function testConnectivity(provider, modelName, apiKey) {
  ensureProviderConfig(provider);
  const lowerModel = (modelName || '').toLowerCase();
  if (provider === 'gemini' && (lowerModel.startsWith('gpt-') || lowerModel.startsWith('dall-e'))) {
    throw new Error(`当前服务商是 Gemini，但模型 ID「${modelName}」看起来是 OpenAI 模型。请改成 Gemini 模型 ID，并使用 Gemini API Key。`);
  }
  if (provider === 'openai' && lowerModel.startsWith('gemini-')) {
    throw new Error(`当前服务商是 OpenAI，但模型 ID「${modelName}」看起来是 Gemini 模型。请改成 OpenAI 模型 ID，并使用 OpenAI API Key。`);
  }
  if (provider === 'claude' && (lowerModel.startsWith('gpt-') || lowerModel.startsWith('gemini-'))) {
    throw new Error(`当前服务商是 Claude，但模型 ID「${modelName}」不是 Claude 模型。请改成 Claude 模型 ID，并使用 Anthropic API Key。`);
  }
  if (provider === 'gemini') {
    const url = providerUrl('gemini', `/models?key=${apiKey}`);
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: proxyHeaders(),
    });
    const data = await readJsonResponse(res, 'Gemini');
    if (!res.ok) {
      const message = getApiErrorMessage(data, `HTTP ${res.status}`);
      if (/API key not valid/i.test(message)) {
        throw new Error(`${message} 请确认服务商选的是 Gemini，并填写 Google AI Studio / Gemini API Key；OpenAI 或 Claude 的 Key 不能用于 Gemini。`);
      }
      throw new Error(message);
    }
    const models = data.models || [];
    const hit = models.find(m => (m.name || '').endsWith(`/${modelName}`));
    if (!hit) {
      return `代理与 Key 可用；但当前账号未列出模型 ${modelName}（共 ${models.length} 个模型）`;
    }
    return `代理与 Key 可用；模型 ${modelName} 在列表中`;
  }
  if (provider === 'openai') {
    const url = providerUrl('openai', '/models');
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        ...proxyHeaders(),
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    const data = await readJsonResponse(res, 'OpenAI');
    if (!res.ok) throw new Error(getApiErrorMessage(data, `HTTP ${res.status}`));
    const models = data.data || [];
    const hit = models.find(m => m.id === modelName);
    if (!hit) {
      return `代理与 Key 可用；但当前账号未列出模型 ${modelName}（共 ${models.length} 个模型）`;
    }
    return `代理与 Key 可用；模型 ${modelName} 在列表中`;
  }
  if (provider === 'claude') {
    // Claude 没有 list models，用一次最小 messages 调用
    const reply = await callClaude(modelName, apiKey, 'hi');
    return `代理与 Key 可用；回复：${(reply || '').slice(0, 60)}`;
  }
  throw new Error(`不支持的服务商: ${provider}`);
}

module.exports = {
  callAI,
  callImage,
  callGeminiImage,
  callOpenAIImage,
  testConnectivity,
  __test: {
    providerUrl,
    proxyHeaders,
  },
};
