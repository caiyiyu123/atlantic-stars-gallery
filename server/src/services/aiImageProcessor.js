const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { callGeminiImage } = require('./aiService');

const uploadsDir = path.resolve(__dirname, '../../uploads');

function extFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function yyyymm() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function processJob(jobId) {
  const startedAt = Date.now();
  try {
    await pool.query(
      'UPDATE ai_image_jobs SET status = ?, error_message = ? WHERE id = ?',
      ['processing', '', jobId]
    );

    const [jobs] = await pool.query('SELECT * FROM ai_image_jobs WHERE id = ?', [jobId]);
    if (jobs.length === 0) throw new Error('任务不存在');
    const job = jobs[0];

    const [keys] = await pool.query('SELECT * FROM api_keys WHERE id = ?', [job.api_key_id]);
    if (keys.length === 0) throw new Error('API Key 已被删除');
    const keyRow = keys[0];
    if (!keyRow.is_active) throw new Error('API Key 已禁用');

    // 读原图
    const absOriginal = path.resolve(uploadsDir, path.relative('uploads', job.original_image_path));
    if (!fs.existsSync(absOriginal)) throw new Error('原图文件不存在');
    const imgBuf = fs.readFileSync(absOriginal);
    const base64 = imgBuf.toString('base64');
    const origExt = path.extname(absOriginal).toLowerCase();
    const origMime = origExt === '.png' ? 'image/png' : origExt === '.webp' ? 'image/webp' : 'image/jpeg';

    // 调用 AI
    const { base64: resultBase64, mimeType } = await callGeminiImage(
      keyRow.model_name, keyRow.api_key, job.prompt_snapshot, base64, origMime
    );

    // 保存结果
    const resultExt = extFromMime(mimeType);
    const resultDir = path.join(uploadsDir, 'ai', String(job.user_id), 'result', yyyymm());
    fs.mkdirSync(resultDir, { recursive: true });
    const resultFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${resultExt}`;
    const absResult = path.join(resultDir, resultFilename);
    fs.writeFileSync(absResult, Buffer.from(resultBase64, 'base64'));
    const relResult = `uploads/ai/${job.user_id}/result/${yyyymm()}/${resultFilename}`;

    const duration = Date.now() - startedAt;
    await pool.query(
      'UPDATE ai_image_jobs SET status = ?, result_image_path = ?, duration_ms = ?, finished_at = NOW() WHERE id = ?',
      ['success', relResult, duration, jobId]
    );
    await pool.query(
      'UPDATE api_keys SET call_count = call_count + 1, last_used_at = NOW() WHERE id = ?',
      [keyRow.id]
    );
  } catch (err) {
    const duration = Date.now() - startedAt;
    const msg = (err.message || '未知错误').slice(0, 500);
    await pool.query(
      'UPDATE ai_image_jobs SET status = ?, error_message = ?, duration_ms = ?, finished_at = NOW() WHERE id = ?',
      ['failed', msg, duration, jobId]
    );
  }
}

module.exports = { processJob };
