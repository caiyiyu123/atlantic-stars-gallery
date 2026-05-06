const config = require('../config/env');

/**
 * 通过 Cloudflare Worker 代理调用 AI 模型
 * 支持：gemini / openai / claude
 */

const FETCH_TIMEOUT_MS = 180000; // 3 分钟（图像生成可能很慢）
const MAX_RETRIES = 2;            // 网络错误最多重试 2 次（共 3 次尝试）
const RETRY_DELAY_MS = 3000;      // 重试间隔 3 秒

function describeFetchError(err) {
  const msg = err?.message || '未知错误';
  const cause = err?.cause;
  if (cause?.code) return `${msg} (${cause.code})`;
  if (cause?.message) return `${msg} (${cause.message.slice(0, 80)})`;
  return msg;
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
  const url = `${config.aiProxy.baseUrl}/gemini/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetchWithRetry(url, {
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
  const res = await fetchWithRetry(url, {
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
  const res = await fetchWithRetry(url, {
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
  const res = await fetchWithRetry(url, {
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

/**
 * 轻量连通性测试（不消耗配额）
 * 通过各家的 list models 接口验证 API Key 与代理可达
 */
async function testConnectivity(provider, modelName, apiKey) {
  if (!config.aiProxy.baseUrl || !config.aiProxy.token) {
    throw new Error('AI 代理未配置');
  }
  if (provider === 'gemini') {
    const url = `${config.aiProxy.baseUrl}/gemini/v1beta/models?key=${apiKey}`;
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: { 'X-Proxy-Token': config.aiProxy.token },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const models = data.models || [];
    const hit = models.find(m => (m.name || '').endsWith(`/${modelName}`));
    if (!hit) {
      return `代理与 Key 可用；但当前账号未列出模型 ${modelName}（共 ${models.length} 个模型）`;
    }
    return `代理与 Key 可用；模型 ${modelName} 在列表中`;
  }
  if (provider === 'openai') {
    const url = `${config.aiProxy.baseUrl}/openai/v1/models`;
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'X-Proxy-Token': config.aiProxy.token,
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
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

module.exports = { callAI, callGeminiImage, testConnectivity };
