const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || '',
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cos: {
    secretId: process.env.COS_SECRET_ID,
    secretKey: process.env.COS_SECRET_KEY,
    bucket: process.env.COS_BUCKET,
    region: process.env.COS_REGION,
    cdnDomain: process.env.COS_CDN_DOMAIN,
    appId: process.env.COS_APP_ID,
  },
  aiProxy: {
    enabled: process.env.AI_USE_PROXY
      ? process.env.AI_USE_PROXY === 'true'
      : Boolean(process.env.AI_PROXY_BASE_URL),
    baseUrl: process.env.AI_PROXY_BASE_URL || '',
    token: process.env.AI_PROXY_TOKEN || '',
  },
  ai: {
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    claudeBaseUrl: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com/v1',
    fetchTimeoutMs: parseInt(process.env.AI_FETCH_TIMEOUT_MS || '600000', 10),
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '0', 10),
    retryDelayMs: parseInt(process.env.AI_RETRY_DELAY_MS || '3000', 10),
  },
};
