const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole, requireModule } = require('../middleware/permission');
const { logOperation } = require('../middleware/operationLog');
const { enqueue } = require('../services/aiJobQueue');
const { processJob } = require('../services/aiImageProcessor');

const router = express.Router();
const uploadsDir = path.resolve(__dirname, '../../uploads');

function yyyymm() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsDir, 'ai', String(req.user.id), 'original', yyyymm());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

// POST /api/ai-jobs  - 提交任务
router.post('/', auth, requireModule('as_ai'), upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0 || files.length > 10) {
      return res.status(400).json({ message: '请上传 1-10 张图片' });
    }

    let models;
    try {
      models = JSON.parse(req.body.models || '[]');
    } catch (e) {
      return res.status(400).json({ message: 'models 参数格式错误' });
    }
    if (!Array.isArray(models) || models.length === 0) {
      return res.status(400).json({ message: '请至少选择一个模型' });
    }

    // 校验 count 范围
    for (const m of models) {
      const c = parseInt(m.count, 10);
      if (!Number.isInteger(c) || c < 1 || c > 10) {
        return res.status(400).json({ message: '每个模型的数量必须是 1-10' });
      }
      m.count = c;
    }

    // 校验 api_key_id 唯一 + 存在且启用
    const keyIds = models.map(m => parseInt(m.api_key_id, 10));
    if (new Set(keyIds).size !== keyIds.length) {
      return res.status(400).json({ message: '同一个 API Key 不能重复' });
    }
    const placeholders = keyIds.map(() => '?').join(',');
    const [keys] = await pool.query(
      `SELECT * FROM api_keys WHERE id IN (${placeholders}) AND is_active = 1`,
      keyIds
    );
    if (keys.length !== keyIds.length) {
      return res.status(400).json({ message: '存在未启用或不存在的 API Key' });
    }

    // 校验总任务数 ≤ 50
    const totalJobs = files.length * models.reduce((s, m) => s + m.count, 0);
    if (totalJobs > 50) {
      return res.status(400).json({ message: `总任务数 ${totalJobs} 超过上限 50，请减少图片或模型数量` });
    }

    // 取默认 prompt 模板
    const [tpls] = await pool.query('SELECT * FROM prompt_templates WHERE is_default = 1 LIMIT 1');
    if (tpls.length === 0) {
      return res.status(500).json({ message: '未配置默认 Prompt 模板，请联系超级管理员' });
    }
    const tpl = tpls[0];

    const batchId = crypto.randomBytes(8).toString('hex');
    const keyMap = new Map(keys.map(k => [k.id, k]));

    const jobIds = [];
    for (const file of files) {
      const relOrig = `uploads/ai/${req.user.id}/original/${yyyymm()}/${file.filename}`;
      for (const m of models) {
        const keyRow = keyMap.get(m.api_key_id);
        for (let i = 0; i < m.count; i++) {
          const [result] = await pool.query(
            `INSERT INTO ai_image_jobs
             (user_id, batch_id, api_key_id, model_name, prompt_template_id, prompt_snapshot, original_image_path, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, batchId, keyRow.id, keyRow.model_name, tpl.id, tpl.content, relOrig]
          );
          jobIds.push(result.insertId);
        }
      }
    }

    // 入队
    for (const jid of jobIds) enqueue(jid, processJob);

    logOperation(req, '提交AI生图', `批次: ${batchId}, 任务数: ${jobIds.length}`);

    const [jobRows] = await pool.query(
      `SELECT id, status, model_name, original_image_path FROM ai_image_jobs WHERE id IN (${jobIds.map(() => '?').join(',')})`,
      jobIds
    );

    res.status(201).json({ batch_id: batchId, jobs: jobRows });
  } catch (err) { next(err); }
});

// GET /api/ai-jobs/batch/:batchId
router.get('/batch/:batchId', auth, requireModule('as_ai'), async (req, res, next) => {
  try {
    const batchId = req.params.batchId;
    const [rows] = await pool.query(
      'SELECT id, status, model_name, original_image_path, result_image_path, error_message, duration_ms FROM ai_image_jobs WHERE batch_id = ? AND user_id = ? ORDER BY id',
      [batchId, req.user.id]
    );
    res.json({ batch_id: batchId, jobs: rows });
  } catch (err) { next(err); }
});

// GET /api/ai-jobs/users  (super_admin only)
router.get('/users', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT u.id, u.username
       FROM users u
       JOIN ai_image_jobs j ON j.user_id = u.id
       ORDER BY u.username`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/ai-jobs/history
router.get('/history', auth, requireModule('as_ai'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 24, 100);
    const offset = (page - 1) * limit;

    // 权限：普通用户锁死 user_id，super_admin 可传
    let userId = req.user.id;
    if (req.user.role === 'super_admin' && req.query.user_id) {
      userId = parseInt(req.query.user_id, 10);
    }

    const where = ['user_id = ?'];
    const params = [userId];
    if (req.query.model_name) { where.push('model_name = ?'); params.push(req.query.model_name); }
    if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
    if (req.query.date_from) { where.push('created_at >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to) { where.push('created_at <= ?'); params.push(req.query.date_to); }

    const whereSql = where.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ai_image_jobs WHERE ${whereSql}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT id, batch_id, model_name, original_image_path, result_image_path, status, error_message, duration_ms, created_at
       FROM ai_image_jobs WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// POST /api/ai-jobs/:id/retry
router.post('/:id/retry', auth, requireModule('as_ai'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT * FROM ai_image_jobs WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    const job = rows[0];
    if (req.user.role !== 'super_admin' && job.user_id !== req.user.id) {
      return res.status(403).json({ message: '只能重试自己的任务' });
    }
    if (job.status === 'pending' || job.status === 'processing') {
      return res.status(400).json({ message: '任务还在进行中，无需重试' });
    }
    await pool.query('UPDATE ai_image_jobs SET status = ?, error_message = ? WHERE id = ?', ['pending', '', id]);
    enqueue(id, processJob);
    res.json({ message: '已重新提交' });
  } catch (err) { next(err); }
});

module.exports = router;
