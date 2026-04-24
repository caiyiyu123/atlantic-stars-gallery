# AS-AI 板块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Atlantic Stars Workspace 上新增一个并列板块 AS-AI，首期仅实现"高清白底图"AI 图像处理功能。

**Architecture:** 两大板块共用前端 layout 但分路由命名空间（`/ai/*`），后端通过新模块权限 `as_ai` 控制访问。AI 调用走已部署的 Cloudflare Worker 代理（`api.atlanticstars.xyz`）。内存队列（并发 3）异步处理生图任务，前端轮询进度。

**Tech Stack:** Express 5 + MySQL（mysql2）+ multer / Vue 3 + Element Plus + Pinia / Gemini 3.1 Flash Image Preview (Nano Banana 2)

**Spec:** [docs/superpowers/specs/2026-04-24-as-ai-board-design.md](../specs/2026-04-24-as-ai-board-design.md)

---

## 重要约定（所有 Task 通用）

1. **项目根目录**：`C:/Users/caiyi/Desktop/CYY应用/atlantic-stars-gallery`，所有路径相对此目录
2. **Git 操作规则**：每次 commit / push **都必须先问用户**（即使 plan 里已写了 commit 指令，实际执行前仍要询问）
3. **重启提示**：改了后端代码 → 必须提示用户重启后端；改了 .env / env.js → 必须提示重启
4. **测试方式**：项目没有自动测试框架。每个 Task 后用 curl / 浏览器手动验证，有"验证"步骤的必须执行
5. **本地 DB**：MySQL `atlantic_stars`，user=root，password=caiyiyu123
6. **测试账号**：`caiyiyu` (super_admin), `admin` (admin), 可用 `POST /api/auth/login` 取 token

---

## Phase A：后端基础设施

### Task A1：数据库迁移 — api_keys 字段重命名

**Files:**
- Create: `server/src/scripts/migrate-api-keys-rename.js`

- [ ] **Step 1：创建迁移脚本**

写入 `server/src/scripts/migrate-api-keys-rename.js`：

```javascript
const pool = require('../config/db');

async function migrate() {
  try {
    // 检查当前字段名
    const [cols] = await pool.query(
      "SHOW COLUMNS FROM api_keys LIKE 'label'"
    );
    if (cols.length === 0) {
      console.log('label 字段不存在，已跳过（可能已重命名为 name）');
      process.exit();
    }
    await pool.query(
      "ALTER TABLE api_keys CHANGE label name VARCHAR(100) DEFAULT ''"
    );
    console.log('api_keys.label → name 重命名成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
```

- [ ] **Step 2：运行脚本**

```bash
cd "C:/Users/caiyi/Desktop/CYY应用/atlantic-stars-gallery/server"
node src/scripts/migrate-api-keys-rename.js
```

预期输出：`api_keys.label → name 重命名成功`（或"已跳过"）

- [ ] **Step 3：验证**

```bash
mysql -u root -pcaiyiyu123 atlantic_stars -e "DESC api_keys" | grep name
```
预期：看到 `name | varchar(100)` 行。

- [ ] **Step 4：暂不 commit**（此脚本联同后续其他迁移脚本和改动一起 commit）

---

### Task A2：数据库迁移 — prompt_templates 表

**Files:**
- Create: `server/src/scripts/migrate-prompt-templates.js`

- [ ] **Step 1：创建迁移脚本**

```javascript
const pool = require('../config/db');

const DEFAULT_PROMPT = `Transform this product photograph into a professional e-commerce main image with the following specifications:

- Pure white background (#FFFFFF), seamless and uniform
- Keep the product's original colors, materials, textures, and details intact — do not alter the product itself
- Remove all shadows, reflections, and environmental elements
- Add subtle, soft ambient shadow beneath the product to ground it naturally
- High resolution, sharp focus, studio-quality lighting
- Center composition with appropriate whitespace margins
- Photorealistic, suitable for premium e-commerce platforms like Amazon, Tmall, Shopify`;

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_default (is_default)
      )
    `);
    console.log('prompt_templates 表创建成功');

    // 植入默认模板（仅在为空时）
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM prompt_templates');
    if (rows[0].cnt === 0) {
      await pool.query(
        'INSERT INTO prompt_templates (name, content, is_default) VALUES (?, ?, 1)',
        ['白底主图', DEFAULT_PROMPT]
      );
      console.log('已植入默认模板「白底主图」');
    }
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
```

- [ ] **Step 2：运行脚本**

```bash
cd "C:/Users/caiyi/Desktop/CYY应用/atlantic-stars-gallery/server"
node src/scripts/migrate-prompt-templates.js
```
预期：`prompt_templates 表创建成功` + `已植入默认模板「白底主图」`

- [ ] **Step 3：验证**

```bash
mysql -u root -pcaiyiyu123 atlantic_stars -e "SELECT id, name, is_default FROM prompt_templates"
```
预期：看到 id=1, name=白底主图, is_default=1

---

### Task A3：数据库迁移 — ai_image_jobs 表

**Files:**
- Create: `server/src/scripts/migrate-ai-image-jobs.js`

- [ ] **Step 1：创建迁移脚本**

```javascript
const pool = require('../config/db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_image_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        batch_id VARCHAR(32) NOT NULL,
        api_key_id INT NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        prompt_template_id INT,
        prompt_snapshot TEXT,
        original_image_path VARCHAR(500) NOT NULL,
        result_image_path VARCHAR(500) DEFAULT '',
        status VARCHAR(20) DEFAULT 'pending',
        error_message VARCHAR(500) DEFAULT '',
        duration_ms INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP NULL,
        INDEX idx_user (user_id),
        INDEX idx_batch (batch_id),
        INDEX idx_status (status)
      )
    `);
    console.log('ai_image_jobs 表创建成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
```

- [ ] **Step 2：运行**

```bash
node src/scripts/migrate-ai-image-jobs.js
```

- [ ] **Step 3：验证**

```bash
mysql -u root -pcaiyiyu123 atlantic_stars -e "DESC ai_image_jobs"
```
预期：看到所有列（user_id, batch_id, api_key_id, ...）

---

### Task A4：扩展 aiService.js 支持图像生成

**Files:**
- Modify: `server/src/services/aiService.js`

- [ ] **Step 1：在 aiService.js 末尾（`module.exports` 之前）新增 `callGeminiImage` 函数**

```javascript
async function callGeminiImage(modelName, apiKey, prompt, originalImageBase64, mimeType = 'image/jpeg') {
  const url = `${config.aiProxy.baseUrl}/gemini/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
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
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inline_data?.data);
  if (!imgPart) {
    throw new Error('AI 未返回图片数据');
  }
  return {
    base64: imgPart.inline_data.data,
    mimeType: imgPart.inline_data.mime_type || 'image/png',
  };
}
```

- [ ] **Step 2：在 `module.exports` 中导出新函数**

把 `module.exports = { callAI };` 改成 `module.exports = { callAI, callGeminiImage };`

- [ ] **Step 3：暂不验证**（后续 Task A5 会调用它验证）

---

### Task A5：任务队列 aiJobQueue.js

**Files:**
- Create: `server/src/services/aiJobQueue.js`

- [ ] **Step 1：创建队列模块**

```javascript
const MAX_CONCURRENT = 3;
const queue = [];
let running = 0;

function enqueue(jobId, worker) {
  queue.push({ jobId, worker });
  tick();
}

function tick() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const { jobId, worker } = queue.shift();
    running++;
    Promise.resolve()
      .then(() => worker(jobId))
      .catch((err) => console.error(`[aiJobQueue] job ${jobId} 异常:`, err.message))
      .finally(() => {
        running--;
        tick();
      });
  }
}

function stats() {
  return { queued: queue.length, running, maxConcurrent: MAX_CONCURRENT };
}

module.exports = { enqueue, stats };
```

---

### Task A6：单任务处理器 aiImageProcessor.js

**Files:**
- Create: `server/src/services/aiImageProcessor.js`

- [ ] **Step 1：创建处理器模块**

```javascript
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
```

---

### Task A7：Prompt 模板路由

**Files:**
- Create: `server/src/routes/promptTemplates.js`

- [ ] **Step 1：创建路由文件**

```javascript
const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const { logOperation } = require('../middleware/operationLog');

const router = express.Router();
const adminOnly = requireRole('super_admin');

// GET /api/prompt-templates
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM prompt_templates ORDER BY is_default DESC, created_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/prompt-templates
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) return res.status(400).json({ message: '请填写名称和内容' });
    const [result] = await pool.query(
      'INSERT INTO prompt_templates (name, content, is_default) VALUES (?, ?, 0)',
      [name, content]
    );
    logOperation(req, '新增Prompt模板', `名称: ${name}`);
    const [rows] = await pool.query('SELECT * FROM prompt_templates WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/prompt-templates/:id
router.put('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, content } = req.body;
    const id = parseInt(req.params.id, 10);
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (fields.length === 0) return res.status(400).json({ message: '无可更新字段' });
    values.push(id);
    await pool.query(`UPDATE prompt_templates SET ${fields.join(', ')} WHERE id = ?`, values);
    logOperation(req, '编辑Prompt模板', `ID: ${id}`);
    const [rows] = await pool.query('SELECT * FROM prompt_templates WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/prompt-templates/:id
router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT is_default FROM prompt_templates WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    if (rows[0].is_default) return res.status(400).json({ message: '默认模板不可删，请先把其他模板设为默认' });
    await pool.query('DELETE FROM prompt_templates WHERE id = ?', [id]);
    logOperation(req, '删除Prompt模板', `ID: ${id}`);
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
});

// POST /api/prompt-templates/:id/set-default
router.post('/:id/set-default', auth, adminOnly, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE prompt_templates SET is_default = 0');
      const [result] = await conn.query('UPDATE prompt_templates SET is_default = 1 WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ message: '不存在' });
      }
      await conn.commit();
      logOperation(req, '设置默认Prompt', `ID: ${id}`);
      res.json({ message: '已设为默认' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
```

---

### Task A8：AI Jobs 路由

**Files:**
- Create: `server/src/routes/aiJobs.js`

- [ ] **Step 1：创建路由文件**

```javascript
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
```

---

### Task A9：扩展 auth.js 和 users.js 以支持 as_ai 权限

**Files:**
- Modify: `server/src/routes/auth.js`
- Modify: `server/src/routes/users.js`

- [ ] **Step 1：修改 auth.js 登录接口的 permissions 默认值**

找到 `let permissions = ['gallery', 'products', 'series'];`，改成：

```javascript
let permissions = ['gallery', 'products', 'series', 'as_ai'];
```

- [ ] **Step 2：修改 users.js 的 `validModules` 数组**

搜索两处 `['gallery', 'products', 'series']`（POST 和 PUT 里都有），都改成：

```javascript
const validModules = ['gallery', 'products', 'series', 'as_ai'];
```

---

### Task A10：注册路由到 app.js

**Files:**
- Modify: `server/src/app.js`

- [ ] **Step 1：在 `app.use('/api/api-keys', ...);` 下方新增两行**

```javascript
app.use('/api/api-keys', require('./routes/apiKeys'));
app.use('/api/prompt-templates', require('./routes/promptTemplates'));
app.use('/api/ai-jobs', require('./routes/aiJobs'));
```

- [ ] **Step 2：重启后端服务**

**告诉用户**：改动了后端路由和 auth 接口，需要 Ctrl+C 停掉当前后端并重新 `npm run dev`。

- [ ] **Step 3：验证后端启动无错误**

重启后控制台应该显示 `Server running on port 3000`，无报错。

- [ ] **Step 4：用 curl 测试 Prompt 模板接口**

用 super_admin 登录拿 token（浏览器登录后从 localStorage 复制）或：

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"caiyiyu","password":"YOUR_PASSWORD"}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/prompt-templates
```

预期：返回包含默认"白底主图"模板的 JSON 数组。

- [ ] **Step 5：确认登录后 permissions 包含 as_ai**

```bash
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"caiyiyu","password":"YOUR_PASSWORD"}' | jq .user.permissions
```
预期：`["gallery","products","series","as_ai"]`

- [ ] **Step 6：暂不 commit**（等前端也改完统一 commit，或分 Phase commit，实际执行时问用户）

---

## Phase B：前端导航框架

### Task B1：API Key 字段统一改名（前后端 label → name）

数据库列已经在 Task A1 改成 `name`。此任务把后端路由代码和前端代码中所有 `label` 改为 `name`，UI 文案"备注"改"名称"。

**Files:**
- Modify: `server/src/routes/apiKeys.js`
- Modify: `client/src/views/admin/ApiKeyManageView.vue`
- 前端 `client/src/api/apiKeys.js` 无改动（透传，无字段引用）

- [ ] **Step 1：修改 `server/src/routes/apiKeys.js`**

全文把 `label` 替换为 `name`。具体位置：
- `const { provider, model_name, api_key, label } = req.body;` 两处（POST 和 PUT）→ 改为 `name`
- `'INSERT INTO api_keys (provider, model_name, api_key, label) VALUES (?, ?, ?, ?)'` → SQL 里 `label` 改为 `name`
- `[provider, model_name, api_key, label || '']` → 变量名改为 `name`
- PUT 里 `if (label !== undefined) { fields.push('label = ?'); values.push(label); }` → 三处 `label` 都改 `name`
- `formatRow` 函数中 `label: row.label,` → `name: row.name,`

完整示例 `formatRow`（改动后）：

```javascript
function formatRow(row) {
  return {
    id: row.id,
    provider: row.provider,
    model_name: row.model_name,
    api_key_masked: maskKey(row.api_key),
    name: row.name,
    is_active: !!row.is_active,
    call_count: row.call_count,
    last_used_at: row.last_used_at,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
    last_test_error: row.last_test_error,
    created_at: row.created_at,
  };
}
```

- [ ] **Step 2：修改 `client/src/views/admin/ApiKeyManageView.vue`**

- `<el-table-column prop="label" label="备注" ... />` → `prop="name" label="名称"`
- `<el-form-item label="备注">` → `label="名称"`
- JS 里所有 `form.label` → `form.name`（包括 `openDialog` 里的 `label: row.label || ''`）
- 初始值 `form = ref({ provider: 'gemini', model_name: '', api_key: '', label: '' });` → 最后一项改 `name: ''`
- 重置函数 `form.value = { provider: 'gemini', model_name: '', api_key: '', label: '' };` 同上
- placeholder `"给这个 Key 起个名字，如「主力Gemini」"` → `"给这个 Key 起个名字，如「Nano Banana 2」"`

- [ ] **Step 3：浏览器验证**

- 硬刷新页面（Ctrl+F5）
- 进入"API Key 管理"
- 列头显示"名称"，已有数据的"名称"列正常显示
- 新增一条：保存成功，名称字段正确存储
- 编辑一条：打开对话框时名称字段有值

---

### Task B2：前端权限支持 as_ai

**Files:**
- Modify: `client/src/views/admin/UserManageView.vue`

- [ ] **Step 1：在模块权限 checkbox 里新增 AS-AI 选项**

搜索 `<el-checkbox label="series">系列管理</el-checkbox>`，在其下方新增：

```vue
<el-checkbox label="as_ai">AS-AI</el-checkbox>
```

- [ ] **Step 2：搜索 moduleLabel 函数（在同文件 `<script>` 内）**

```javascript
function moduleLabel(mod) {
  const map = { gallery: '产品图库', products: '产品管理', series: '系列管理' };
  return map[mod] || mod;
}
```

改成：

```javascript
function moduleLabel(mod) {
  const map = { gallery: '产品图库', products: '产品管理', series: '系列管理', as_ai: 'AS-AI' };
  return map[mod] || mod;
}
```

- [ ] **Step 3：浏览器验证**

- 登录 super_admin，进用户管理
- 新增一个 operator 用户，模块权限里能看到"AS-AI"
- 勾选后保存，列表中该用户的权限列显示"AS-AI"

---

### Task B3：创建 ChooseView 选择页

**Files:**
- Create: `client/src/views/ChooseView.vue`

- [ ] **Step 1：写组件**

```vue
<template>
  <div class="choose-bg">
    <div class="choose-container">
      <img src="@/assets/logo.png" alt="Atlantic Stars" class="choose-logo" />
      <h1 class="choose-title">Welcome, {{ auth.user?.displayName }}</h1>
      <p class="choose-subtitle">请选择要进入的板块</p>

      <div class="choose-grid">
        <div
          class="choose-card"
          :class="{ disabled: !hasGallery }"
          @click="enter('gallery')"
        >
          <div class="choose-icon">📦</div>
          <div class="choose-card-title">AS 产品库</div>
          <div class="choose-card-desc">查看和管理产品图片、系列、用户</div>
          <div class="choose-card-cta">
            {{ hasGallery ? '进入 →' : '暂无权限' }}
          </div>
        </div>

        <div
          class="choose-card"
          :class="{ disabled: !hasAsAi }"
          @click="enter('as_ai')"
        >
          <div class="choose-icon">🤖</div>
          <div class="choose-card-title">AS-AI</div>
          <div class="choose-card-desc">AI 高清白底图（更多功能开发中）</div>
          <div class="choose-card-cta">
            {{ hasAsAi ? '进入 →' : '暂无权限' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const hasGallery = computed(() =>
  auth.hasModule('gallery') || auth.hasModule('products') || auth.hasModule('series') || auth.isAdmin
);
const hasAsAi = computed(() => auth.hasModule('as_ai'));

function enter(section) {
  if (section === 'gallery' && hasGallery.value) {
    router.push('/');
  } else if (section === 'as_ai' && hasAsAi.value) {
    router.push('/ai/hd-white');
  }
}
</script>

<style scoped>
.choose-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #CF2028, #EE7624, #F5D726);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.choose-container {
  max-width: 900px;
  width: 100%;
  text-align: center;
}

.choose-logo {
  height: 80px;
  margin-bottom: 24px;
}

.choose-title {
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.choose-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 16px;
  margin: 0 0 40px 0;
}

.choose-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 640px) {
  .choose-grid { grid-template-columns: 1fr; }
}

.choose-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 40px 32px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.choose-card:not(.disabled):hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.choose-card.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.choose-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.choose-card-title {
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 8px;
}

.choose-card-desc {
  font-size: 14px;
  color: #86868b;
  margin-bottom: 24px;
  min-height: 40px;
}

.choose-card-cta {
  font-size: 15px;
  font-weight: 600;
  color: #CF2028;
}

.choose-card.disabled .choose-card-cta {
  color: #86868b;
}
</style>
```

---

### Task B4：路由扩展

**Files:**
- Modify: `client/src/router/index.js`

- [ ] **Step 1：新增 /choose 路由（放在 `/login` 下方）**

```javascript
{
  path: '/choose',
  name: 'Choose',
  component: () => import('../views/ChooseView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 2：在 `children` 数组末尾新增 AS-AI 路由**

```javascript
{
  path: 'ai/hd-white',
  name: 'AiHdWhite',
  component: () => import('../views/ai/HdWhiteView.vue'),
  meta: { requiredModule: 'as_ai' },
},
{
  path: 'ai/feature-2',
  name: 'AiFeature2',
  component: () => import('../views/ai/FeaturePlaceholderView.vue'),
  meta: { requiredModule: 'as_ai' },
  props: { featureName: '功能二' },
},
{
  path: 'ai/feature-3',
  name: 'AiFeature3',
  component: () => import('../views/ai/FeaturePlaceholderView.vue'),
  meta: { requiredModule: 'as_ai' },
  props: { featureName: '功能三' },
},
```

- [ ] **Step 3：修改登录成功后的默认跳转**

搜索 `client/src/views/LoginView.vue` 里登录成功的 `router.push`，如果是 `router.push('/')`，改成 `router.push('/choose')`。

打开 `client/src/views/LoginView.vue`，找到类似 `router.push('/')` 或 `router.replace('/')`，改成 `router.push('/choose')`。

- [ ] **Step 4：修改 `/login` guard（已登录访问 /login 时跳转）**

在 router guard 里搜索 `if (to.meta.guest && auth.isLoggedIn)`，把 `return next('/');` 改为 `return next('/choose');`

---

### Task B5：AppNav 改造（切换按钮 + 按板块切换按钮组）

**Files:**
- Modify: `client/src/components/AppNav.vue`

- [ ] **Step 1：重写 AppNav.vue 模板部分**

把 `<template>` 里的 `<div class="nav-right">` 部分改成：

```vue
<div class="nav-right">
  <div v-if="showSwitchButton" class="nav-switch-wrap">
    <router-link :to="switchTarget" class="nav-switch">{{ switchLabel }}</router-link>
  </div>
  <div class="nav-user-row">
    <span class="nav-username">{{ auth.user?.displayName }}</span>
    <div class="nav-avatar-wrapper" @click="showDropdown = !showDropdown" v-click-outside="() => showDropdown = false">
      <div class="nav-avatar">{{ auth.user?.displayName?.charAt(0) }}</div>
      <div v-if="showDropdown" class="nav-dropdown">
        <router-link v-if="auth.isAdmin" to="/admin/users" class="dropdown-item" @click="showDropdown = false">
          用户管理
        </router-link>
        <router-link v-if="auth.isSuperAdmin" to="/admin/api-keys" class="dropdown-item" @click="showDropdown = false">
          API Key 管理
        </router-link>
        <div class="dropdown-item dropdown-logout" @click="handleLogout">退出登录</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2：把左侧 `nav-left` 里三个 router-link 改成按 `isAiSection` 切换**

原代码：
```vue
<div class="nav-left">
  <router-link to="/" class="nav-logo nav-logo-desktop">...</router-link>
  <router-link v-if="auth.hasModule('gallery')" to="/" class="nav-link nav-link-yellow" :class="{ active: route.name === 'ProductList' }">产品图库</router-link>
  <router-link v-if="auth.hasModule('products')" ...>产品管理</router-link>
  <router-link v-if="auth.hasModule('series')" ...>系列管理</router-link>
</div>
```

改成：
```vue
<div class="nav-left">
  <router-link :to="isAiSection ? '/ai/hd-white' : '/'" class="nav-logo nav-logo-desktop">
    <img src="@/assets/logo.png" alt="Atlantic Stars" class="nav-logo-img" />
  </router-link>

  <!-- AS 产品库板块 -->
  <template v-if="!isAiSection">
    <router-link v-if="auth.hasModule('gallery')" to="/" class="nav-link nav-link-yellow" :class="{ active: route.name === 'ProductList' }">产品图库</router-link>
    <router-link v-if="auth.hasModule('products')" to="/admin/products" class="nav-link nav-link-orange" :class="{ active: route.name === 'ProductManage' }">产品管理</router-link>
    <router-link v-if="auth.hasModule('series')" to="/admin/series" class="nav-link nav-link-red" :class="{ active: route.name === 'SeriesManage' }">系列管理</router-link>
  </template>

  <!-- AS-AI 板块 -->
  <template v-else>
    <router-link to="/ai/hd-white" class="nav-link nav-link-yellow" :class="{ active: route.name === 'AiHdWhite' }">高清白底图</router-link>
    <span class="nav-link nav-link-orange nav-link-disabled" title="敬请期待">功能二</span>
    <span class="nav-link nav-link-red nav-link-disabled" title="敬请期待">功能三</span>
  </template>
</div>
```

- [ ] **Step 3：`<script setup>` 中新增 computed**

在 `const auth = useAuthStore();` 下方新增：

```javascript
import { computed } from 'vue';

const isAiSection = computed(() => route.path.startsWith('/ai'));

const switchTarget = computed(() => isAiSection.value ? '/' : '/ai/hd-white');
const switchLabel = computed(() => isAiSection.value ? '← 切换到 AS 产品库' : '切换到 AS-AI →');

const showSwitchButton = computed(() => {
  // 如果当前是 AI 板块，检查用户有无产品库任何模块权限
  // 如果当前是产品库板块，检查用户有无 as_ai 权限
  if (isAiSection.value) {
    return auth.hasModule('gallery') || auth.hasModule('products') || auth.hasModule('series') || auth.isAdmin;
  }
  return auth.hasModule('as_ai');
});
```

如果已有 `import { ref } from 'vue';`，把 `computed` 加进去：`import { ref, computed } from 'vue';`

- [ ] **Step 4：新增样式**

在 `<style scoped>` 末尾新增：

```css
.nav-switch-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.nav-switch {
  font-size: 12px;
  color: var(--color-text-secondary, #86868b);
  text-decoration: none;
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e5e7);
  border-radius: 14px;
  background: #fff;
  transition: all 0.2s;
}

.nav-switch:hover {
  border-color: #CF2028;
  color: #CF2028;
}

.nav-user-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-link-disabled {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}

.nav-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}

@media (max-width: 768px) {
  .nav-switch-wrap { display: none; }
}
```

删除原来 `.nav-right` 的 `flex-direction` 相关的样式（如果有）。

- [ ] **Step 5：浏览器验证**

- 重新登录，在产品库页面右上角能看到"切换到 AS-AI →"按钮（假设你有 as_ai 权限）
- 点击按钮 → 跳转到 /ai/hd-white（页面还没写，可能 404 或白屏，Task C 会实现）

---

### Task B6：创建占位页 FeaturePlaceholderView

**Files:**
- Create: `client/src/views/ai/FeaturePlaceholderView.vue`

- [ ] **Step 1：写组件**

```vue
<template>
  <div class="placeholder">
    <div class="placeholder-icon">🚧</div>
    <h2>{{ featureName }}</h2>
    <p>功能开发中，敬请期待</p>
  </div>
</template>

<script setup>
defineProps({
  featureName: { type: String, default: '功能' },
});
</script>

<style scoped>
.placeholder {
  text-align: center;
  padding: 80px 20px;
  color: #86868b;
}
.placeholder-icon { font-size: 64px; margin-bottom: 16px; }
.placeholder h2 { font-size: 24px; color: #1d1d1f; margin-bottom: 8px; }
</style>
```

---

## Phase C：AS-AI 核心功能

### Task C1：前端 API 模块

**Files:**
- Create: `client/src/api/promptTemplates.js`
- Create: `client/src/api/aiJobs.js`

- [ ] **Step 1：promptTemplates.js**

```javascript
import request from './request';

export const getPromptTemplates = () => request.get('/prompt-templates');
export const createPromptTemplate = (data) => request.post('/prompt-templates', data);
export const updatePromptTemplate = (id, data) => request.put(`/prompt-templates/${id}`, data);
export const deletePromptTemplate = (id) => request.delete(`/prompt-templates/${id}`);
export const setDefaultTemplate = (id) => request.post(`/prompt-templates/${id}/set-default`);
```

- [ ] **Step 2：aiJobs.js**

```javascript
import request from './request';

export const submitAiJobs = (formData) => request.post('/ai-jobs', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const getBatchStatus = (batchId) => request.get(`/ai-jobs/batch/${batchId}`);
export const getJobHistory = (params) => request.get('/ai-jobs/history', { params });
export const retryJob = (id) => request.post(`/ai-jobs/${id}/retry`);
export const getJobUsers = () => request.get('/ai-jobs/users');
```

---

### Task C2：HdWhiteView 主容器（三 tab）

**Files:**
- Create: `client/src/views/ai/HdWhiteView.vue`

- [ ] **Step 1：写主容器**

```vue
<template>
  <div class="hd-white">
    <div class="admin-header">
      <h2 class="admin-title">高清白底图</h2>
    </div>

    <el-tabs v-model="activeTab" class="hd-tabs">
      <el-tab-pane label="处理图片" name="process">
        <ProcessTab v-if="activeTab === 'process'" />
      </el-tab-pane>
      <el-tab-pane label="历史记录" name="history">
        <HistoryTab v-if="activeTab === 'history'" />
      </el-tab-pane>
      <el-tab-pane v-if="auth.isSuperAdmin" label="Prompt 模板" name="templates">
        <PromptTemplateTab v-if="activeTab === 'templates'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import ProcessTab from './components/ProcessTab.vue';
import HistoryTab from './components/HistoryTab.vue';
import PromptTemplateTab from './components/PromptTemplateTab.vue';

const auth = useAuthStore();
const activeTab = ref('process');
</script>

<style scoped>
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.admin-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.hd-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 500;
}
</style>
```

---

### Task C3：ProcessTab（上传 + 模型配置 + 进度 + 结果）

**Files:**
- Create: `client/src/views/ai/components/ProcessTab.vue`

- [ ] **Step 1：写组件**

```vue
<template>
  <div class="process-tab">
    <!-- 上传区 -->
    <el-upload
      class="uploader"
      drag
      multiple
      :auto-upload="false"
      :on-change="handleFileChange"
      :on-remove="handleFileRemove"
      :file-list="fileList"
      :limit="10"
      accept="image/jpeg,image/png,image/webp"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽图片到此，或<em>点击选择</em></div>
      <template #tip>
        <div class="upload-tip">支持 JPG/PNG/WEBP，单张 ≤ 20MB，一次最多 10 张</div>
      </template>
    </el-upload>

    <!-- 模型配置 -->
    <div class="model-config">
      <h3 class="section-title">模型配置</h3>
      <div v-if="!defaultKey" class="warning">
        <el-alert type="warning" :closable="false" title="未找到名称为 'Nano Banana 2' 的 API Key" show-icon>
          请先在 API Key 管理中添加并启用一个名称为 <strong>Nano Banana 2</strong> 的 Key
        </el-alert>
      </div>
      <div v-else>
        <div class="model-row default-row">
          <div class="model-label">
            <el-tag type="warning">默认</el-tag>
            <span class="model-name">{{ defaultKey.name }}</span>
          </div>
          <el-input-number v-model="defaultCount" :min="1" :max="10" size="default" />
        </div>

        <div v-for="(item, idx) in extraModels" :key="idx" class="model-row">
          <div class="model-label">
            <el-select v-model="item.api_key_id" placeholder="选择模型">
              <el-option
                v-for="key in availableExtraKeys(item.api_key_id)"
                :key="key.id"
                :label="`${key.name} (${key.model_name})`"
                :value="key.id"
              />
            </el-select>
          </div>
          <el-input-number v-model="item.count" :min="1" :max="10" size="default" />
          <el-button text type="danger" @click="removeModel(idx)">×</el-button>
        </div>

        <el-button type="primary" plain @click="addModel" :disabled="!canAddMore">+ 添加模型</el-button>
      </div>

      <div class="submit-row">
        <span class="total-tip">总任务数：{{ totalJobs }} / 50</span>
        <el-button
          type="primary"
          size="large"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="handleSubmit"
        >
          开始处理
        </el-button>
      </div>
    </div>

    <!-- 进度 + 结果 -->
    <div v-if="currentBatch" class="progress-section">
      <h3 class="section-title">处理进度</h3>
      <el-progress :percentage="progressPercent" :status="allDone ? 'success' : ''" />
      <p class="progress-text">{{ doneCount }} / {{ currentBatch.jobs.length }} 完成{{ failedCount ? `（${failedCount} 失败）` : '' }}</p>

      <div class="result-grid">
        <div v-for="job in currentBatch.jobs" :key="job.id" class="result-card">
          <div v-if="job.status === 'success'" class="result-img-wrap">
            <img :src="toUrl(job.result_image_path)" class="result-img" @click="preview(job)" />
            <div class="result-model">{{ job.model_name }}</div>
            <a :href="toUrl(job.result_image_path)" download target="_blank" class="result-action">下载</a>
          </div>
          <div v-else-if="job.status === 'failed'" class="result-img-wrap failed">
            <div class="failed-icon">❌</div>
            <div class="result-model">{{ job.model_name }}</div>
            <div class="error-text" :title="job.error_message">{{ job.error_message.slice(0, 30) }}...</div>
            <el-button size="small" type="primary" @click="handleRetry(job.id)">重试</el-button>
          </div>
          <div v-else class="result-img-wrap processing">
            <el-icon class="is-loading"><loading /></el-icon>
            <div class="result-model">{{ job.model_name }}</div>
            <div class="status-text">{{ job.status === 'pending' ? '等待中' : '处理中...' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 大图预览 -->
    <el-dialog v-model="previewVisible" width="80%" :show-close="true">
      <div class="preview-compare">
        <div class="compare-col">
          <div class="compare-label">原图</div>
          <img v-if="previewJob" :src="toUrl(previewJob.original_image_path)" class="compare-img" />
        </div>
        <div class="compare-col">
          <div class="compare-label">结果</div>
          <img v-if="previewJob" :src="toUrl(previewJob.result_image_path)" class="compare-img" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled, Loading } from '@element-plus/icons-vue';
import { getApiKeys } from '../../../api/apiKeys';
import { submitAiJobs, getBatchStatus, retryJob } from '../../../api/aiJobs';

const fileList = ref([]);
const allKeys = ref([]);
const defaultCount = ref(1);
const extraModels = ref([]);
const submitting = ref(false);

const currentBatch = ref(null);
let pollTimer = null;

const previewVisible = ref(false);
const previewJob = ref(null);

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:3000';

const defaultKey = computed(() => allKeys.value.find(k => k.name === 'Nano Banana 2' && k.is_active));

const availableExtraKeys = (currentId) => {
  const usedIds = new Set([
    defaultKey.value?.id,
    ...extraModels.value.map(m => m.api_key_id),
  ].filter(Boolean));
  if (currentId) usedIds.delete(currentId);
  return allKeys.value.filter(k => k.is_active && !usedIds.has(k.id));
};

const canAddMore = computed(() => availableExtraKeys().length > 0);

const totalJobs = computed(() => {
  const modelCount = defaultCount.value + extraModels.value.reduce((s, m) => s + (m.count || 0), 0);
  return fileList.value.length * modelCount;
});

const canSubmit = computed(() =>
  defaultKey.value && fileList.value.length > 0 && totalJobs.value > 0 && totalJobs.value <= 50 && !submitting.value
);

const doneCount = computed(() =>
  currentBatch.value?.jobs.filter(j => j.status === 'success' || j.status === 'failed').length || 0
);
const failedCount = computed(() =>
  currentBatch.value?.jobs.filter(j => j.status === 'failed').length || 0
);
const progressPercent = computed(() => {
  if (!currentBatch.value) return 0;
  return Math.round((doneCount.value / currentBatch.value.jobs.length) * 100);
});
const allDone = computed(() =>
  currentBatch.value && doneCount.value === currentBatch.value.jobs.length
);

function toUrl(relPath) {
  return relPath.startsWith('http') ? relPath : `${BASE_URL}/${relPath}`;
}

function handleFileChange(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning(`${file.name} 超过 20MB`);
    fileList.value = fileList.value.filter(f => f.uid !== file.uid);
    return;
  }
  // fileList 由 el-upload 自动维护（通过 v-model 或 on-change）
}

function handleFileRemove(file) {
  fileList.value = fileList.value.filter(f => f.uid !== file.uid);
}

function addModel() {
  const avail = availableExtraKeys();
  if (avail.length === 0) return;
  extraModels.value.push({ api_key_id: avail[0].id, count: 1 });
}

function removeModel(idx) {
  extraModels.value.splice(idx, 1);
}

async function handleSubmit() {
  if (totalJobs.value > 50) {
    return ElMessage.warning(`总任务数 ${totalJobs.value} 超过上限 50`);
  }
  submitting.value = true;
  try {
    const formData = new FormData();
    for (const f of fileList.value) formData.append('files', f.raw);
    const models = [
      { api_key_id: defaultKey.value.id, count: defaultCount.value },
      ...extraModels.value.map(m => ({ api_key_id: m.api_key_id, count: m.count })),
    ];
    formData.append('models', JSON.stringify(models));
    const res = await submitAiJobs(formData);
    currentBatch.value = res;
    ElMessage.success(`已提交 ${res.jobs.length} 个任务`);
    startPolling(res.batch_id);
  } catch (err) {
    // 错误会由全局拦截器弹 message
  } finally {
    submitting.value = false;
  }
}

function startPolling(batchId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    const res = await getBatchStatus(batchId);
    currentBatch.value = res;
    if (res.jobs.every(j => j.status === 'success' || j.status === 'failed')) {
      stopPolling();
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handleRetry(jobId) {
  await retryJob(jobId);
  ElMessage.success('已重新提交');
  if (currentBatch.value) startPolling(currentBatch.value.batch_id);
}

function preview(job) {
  previewJob.value = job;
  previewVisible.value = true;
}

onMounted(async () => {
  allKeys.value = await getApiKeys();
});

onUnmounted(stopPolling);
</script>

<style scoped>
.process-tab { padding: 8px 0; }
.uploader { margin-bottom: 32px; }
.upload-tip { color: #86868b; font-size: 12px; margin-top: 4px; }

.section-title { font-size: 16px; font-weight: 600; margin: 0 0 16px 0; }

.model-config { margin-bottom: 32px; }
.model-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  margin-bottom: 8px;
}
.default-row { background: #fff8e1; }
.model-label { flex: 1; display: flex; align-items: center; gap: 8px; }
.model-name { font-weight: 500; }

.submit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
}
.total-tip { color: #86868b; font-size: 13px; }

.warning { margin-bottom: 16px; }

.progress-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e5e7;
}
.progress-text { text-align: center; color: #86868b; font-size: 13px; margin: 8px 0 20px; }

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.result-card { background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e7; }
.result-img-wrap { padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.result-img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #f5f5f7; border-radius: 8px; cursor: pointer; }
.result-model { font-size: 12px; color: #86868b; }
.result-action { color: #CF2028; text-decoration: none; font-size: 13px; font-weight: 500; }
.failed, .processing { min-height: 200px; justify-content: center; }
.failed-icon { font-size: 36px; }
.error-text { color: #c9302c; font-size: 12px; text-align: center; }
.status-text { color: #86868b; font-size: 12px; }

.preview-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.compare-col { text-align: center; }
.compare-label { font-weight: 500; margin-bottom: 8px; }
.compare-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; }
</style>
```

---

### Task C4：HistoryTab（瀑布流 + 筛选 + 对比弹窗）

**Files:**
- Create: `client/src/views/ai/components/HistoryTab.vue`

- [ ] **Step 1：写组件**

```vue
<template>
  <div class="history-tab">
    <div class="filter-row">
      <el-select v-if="auth.isSuperAdmin" v-model="filter.user_id" placeholder="所有用户" clearable style="width: 160px;" @change="refetch">
        <el-option v-for="u in userList" :key="u.id" :label="u.username" :value="u.id" />
      </el-select>
      <el-select v-model="filter.model_name" placeholder="所有模型" clearable style="width: 200px;" @change="refetch">
        <el-option v-for="m in modelList" :key="m" :label="m" :value="m" />
      </el-select>
      <el-select v-model="filter.status" placeholder="所有状态" clearable style="width: 120px;" @change="refetch">
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="进行中" value="processing" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        @change="onDateChange"
      />
    </div>

    <div v-loading="loading" class="grid">
      <div v-for="job in list" :key="job.id" class="card" @click="preview(job)">
        <div class="img-wrap">
          <img v-if="job.status === 'success'" :src="toUrl(job.result_image_path)" />
          <div v-else class="fail-placeholder">
            <span>{{ job.status === 'failed' ? '❌ 失败' : job.status }}</span>
          </div>
        </div>
        <div class="card-info">
          <div class="model-name">{{ job.model_name }}</div>
          <div class="time">{{ formatTime(job.created_at) }}</div>
          <a v-if="job.status === 'success'" :href="toUrl(job.result_image_path)" target="_blank" download class="download" @click.stop>下载</a>
        </div>
      </div>
    </div>

    <div v-if="pagination.totalPages > 1" class="pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="onPageChange"
      />
    </div>

    <!-- 大图预览 -->
    <el-dialog v-model="previewVisible" width="80%">
      <div v-if="previewJob" class="preview-compare">
        <div class="compare-col">
          <div class="compare-label">原图</div>
          <img :src="toUrl(previewJob.original_image_path)" class="compare-img" />
        </div>
        <div class="compare-col">
          <div class="compare-label">结果</div>
          <img v-if="previewJob.result_image_path" :src="toUrl(previewJob.result_image_path)" class="compare-img" />
          <div v-else class="error-msg">{{ previewJob.error_message || '未生成结果' }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useAuthStore } from '../../../stores/auth';
import { getJobHistory, getJobUsers } from '../../../api/aiJobs';
import { getApiKeys } from '../../../api/apiKeys';

const auth = useAuthStore();
const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:3000';

const list = ref([]);
const loading = ref(false);
const pagination = reactive({ page: 1, limit: 24, total: 0, totalPages: 0 });

const filter = reactive({ user_id: '', model_name: '', status: '', date_from: '', date_to: '' });
const dateRange = ref(null);

const userList = ref([]);
const modelList = ref([]);

const previewVisible = ref(false);
const previewJob = ref(null);

function toUrl(relPath) {
  return relPath.startsWith('http') ? relPath : `${BASE_URL}/${relPath}`;
}

function formatTime(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchList() {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filter.user_id) params.user_id = filter.user_id;
    if (filter.model_name) params.model_name = filter.model_name;
    if (filter.status) params.status = filter.status;
    if (filter.date_from) params.date_from = filter.date_from;
    if (filter.date_to) params.date_to = filter.date_to;
    const res = await getJobHistory(params);
    list.value = res.data;
    Object.assign(pagination, res.pagination);
  } finally { loading.value = false; }
}

function onDateChange(val) {
  if (val && val.length === 2) {
    filter.date_from = val[0];
    filter.date_to = val[1];
  } else {
    filter.date_from = '';
    filter.date_to = '';
  }
  refetch();
}

function refetch() {
  pagination.page = 1;
  fetchList();
}

function onPageChange(p) {
  pagination.page = p;
  fetchList();
}

function preview(job) {
  previewJob.value = job;
  previewVisible.value = true;
}

onMounted(async () => {
  // 拉 Key 列表做模型筛选
  try {
    const keys = await getApiKeys();
    modelList.value = [...new Set(keys.map(k => k.model_name))];
  } catch (e) { /* 非 super_admin 拿不到，忽略 */ }

  if (auth.isSuperAdmin) {
    try {
      userList.value = await getJobUsers();
    } catch (e) { /* ignore */ }
  }
  fetchList();
});
</script>

<style scoped>
.filter-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.card {
  background: #fff;
  border: 1px solid #e5e5e7;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
.img-wrap { aspect-ratio: 1; background: #f5f5f7; }
.img-wrap img { width: 100%; height: 100%; object-fit: contain; }
.fail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #c9302c; }
.card-info { padding: 10px 12px; }
.model-name { font-size: 13px; font-weight: 500; color: #1d1d1f; }
.time { font-size: 12px; color: #86868b; margin: 4px 0; }
.download { font-size: 12px; color: #CF2028; text-decoration: none; }
.pagination { display: flex; justify-content: center; margin-top: 20px; }

.preview-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.compare-col { text-align: center; }
.compare-label { font-weight: 500; margin-bottom: 8px; }
.compare-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; }
.error-msg { color: #c9302c; padding: 20px; }
</style>
```

---

### Task C5：PromptTemplateTab（仅 super_admin）

**Files:**
- Create: `client/src/views/ai/components/PromptTemplateTab.vue`

- [ ] **Step 1：写组件**

```vue
<template>
  <div class="template-tab">
    <div class="header-row">
      <el-button type="primary" @click="openDialog()">+ 新增模板</el-button>
    </div>

    <el-table :data="list" v-loading="loading" style="width: 100%;">
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column label="Prompt 内容" min-width="300">
        <template #default="{ row }">
          <div class="prompt-preview">{{ row.content.slice(0, 80) }}{{ row.content.length > 80 ? '...' : '' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="80" align="center">
        <template #default="{ row }">
          <span v-if="row.is_default" class="star">⭐</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" align="center">
        <template #default="{ row }">
          <el-button v-if="!row.is_default" text type="warning" @click="handleSetDefault(row)">设为默认</el-button>
          <el-button text type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button text type="danger" :disabled="row.is_default" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑模板' : '新增模板'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：白底主图 / 透明背景" />
        </el-form-item>
        <el-form-item label="Prompt">
          <el-input v-model="form.content" type="textarea" :rows="10" placeholder="给 AI 的指令..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getPromptTemplates, createPromptTemplate,
  updatePromptTemplate, deletePromptTemplate, setDefaultTemplate,
} from '../../../api/promptTemplates';

const list = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ name: '', content: '' });

async function fetchList() {
  loading.value = true;
  try { list.value = await getPromptTemplates(); } finally { loading.value = false; }
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = { name: row.name, content: row.content };
  } else {
    editingId.value = null;
    form.value = { name: '', content: '' };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.content) {
    return ElMessage.warning('请填写名称和内容');
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePromptTemplate(editingId.value, form.value);
      ElMessage.success('更新成功');
    } else {
      await createPromptTemplate(form.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } finally { saving.value = false; }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除模板「${row.name}」？`, '确认', { type: 'warning' });
  await deletePromptTemplate(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

async function handleSetDefault(row) {
  await setDefaultTemplate(row.id);
  ElMessage.success('已设为默认');
  fetchList();
}

onMounted(fetchList);
</script>

<style scoped>
.header-row { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.prompt-preview { color: #86868b; font-size: 13px; line-height: 1.5; }
.star { font-size: 18px; }
</style>
```

---

## Phase D：联调测试 + 部署

### Task D1：本地端到端测试

**前置**：所有迁移脚本已运行，后端已重启，前端热更新已生效。

- [ ] **Step 1：登录流程**

- 浏览器访问 `http://localhost:5173/login`
- 用 `caiyiyu` 登录
- **预期**：跳转到 `/choose` 选择页，看到两张卡片

- [ ] **Step 2：进入 AS-AI**

- 点击"AS-AI"卡片
- **预期**：跳转到 `/ai/hd-white`，看到"高清白底图"页面，顶部三 tab

- [ ] **Step 3：API Key 验证**

- 点击右上角头像 → "API Key 管理"
- **预期**：看到"名称"列（而不是"备注"）
- 新增一条：服务商 Gemini，模型 `gemini-3.1-flash-image-preview`，**名称填 `Nano Banana 2`**，Key 填你的 Gemini Key
- 回到 AS-AI → 处理图片
- **预期**：模型配置区显示"Nano Banana 2"的默认行

- [ ] **Step 4：生图测试**

- 传一张产品图
- 保持默认 Nano Banana 2 × 1
- 点"开始处理"
- **预期**：进度条从 0 → 100%，结果图显示，能下载

- [ ] **Step 5：历史记录**

- 切到"历史记录" tab
- **预期**：刚才的成功任务显示在瀑布流中
- 点卡片，弹出原图 vs 结果图对比

- [ ] **Step 6：Prompt 模板**

- 切到 "Prompt 模板" tab
- **预期**：看到默认的"白底主图"模板，带 ⭐
- 新增一条，设为默认 → 原来的 ⭐ 消失，新的变默认

- [ ] **Step 7：权限验证**

- 退出登录，用 admin 登录
- **预期**：选择页两张卡片都可点击（admin 自动有所有模块权限）
- 进入 AS-AI，三个 tab 只看到两个（没有 Prompt 模板 tab）
- 退出，用 operator 登录（需先在用户管理里创建一个仅有 as_ai 权限的）
- **预期**：选择页只有 AS-AI 卡片可点，产品库卡片置灰

- [ ] **Step 8：错误场景**

- 把 API Key 管理里的 Nano Banana 2 停用
- 回到 AS-AI 处理图片 tab
- **预期**：显示警告 "未找到名称为 'Nano Banana 2' 的 API Key"
- 重新启用

---

### Task D2：提交代码 + 推送 + 部署

- [ ] **Step 1：确认本地测试全部通过**

- [ ] **Step 2：询问用户是否 commit**

提示用户：本地测试通过，准备 commit 以下改动（列出大类）：
- 后端：3 个迁移脚本 + aiService 扩展 + 2 个 service + 2 个 route + app.js / auth.js / users.js 改动
- 前端：API Key 字段改名 + UserManage 加 AS-AI + ChooseView + AppNav 改造 + 路由 + AS-AI 主容器及三个 tab + 占位页

- [ ] **Step 3：用户同意后 commit**

```bash
cd "C:/Users/caiyi/Desktop/CYY应用/atlantic-stars-gallery"
git add -A
git commit -m "feat: add AS-AI board with HD white background image feature"
```

- [ ] **Step 4：询问用户是否 push**

- [ ] **Step 5：用户同意后 push**

```bash
git push
```

- [ ] **Step 6：服务器部署（询问用户是否同步到服务器）**

提示用户在服务器上执行：
```bash
cd /www/atlantic-stars-gallery
git pull
cd server
node src/scripts/migrate-api-keys-rename.js
node src/scripts/migrate-prompt-templates.js
node src/scripts/migrate-ai-image-jobs.js
pm2 delete atlantic-server && pm2 start src/app.js --name atlantic-server
```

并在服务器 `.env` 中确认有 `AI_PROXY_BASE_URL` 和 `AI_PROXY_TOKEN`（之前 Task 已添加过，但服务器 .env 可能没同步）。

- [ ] **Step 7：前端生产构建（用户如果有 CI/CD 则跳过）**

```bash
cd client
npm run build
# 部署 dist/ 到 Nginx 或静态站点
```

---

## 测试覆盖 & 边界检查

以下场景都应通过测试：

- [ ] 登录后跳 /choose
- [ ] /choose 无权限卡片置灰不可点
- [ ] 切换按钮在无权限一侧时隐藏
- [ ] 导航栏在 /ai/* 下显示 AS-AI 三按钮（功能二/三灰置）
- [ ] 非 as_ai 权限用户访问 /ai/* 被重定向
- [ ] 无默认 prompt 模板时，POST /api/ai-jobs 返回 500 并提示
- [ ] 总任务数 > 50 被拒绝
- [ ] 同一 api_key_id 重复被拒绝
- [ ] count 超出 1-10 范围被拒绝
- [ ] 文件数 > 10 被拒绝
- [ ] AI 调用失败：单张 job status = failed，其他 job 不受影响
- [ ] 失败 job 点重试后重新入队
- [ ] 设默认模板后，旧默认自动取消
- [ ] 默认模板不可删除
- [ ] 普通用户访问 /api/ai-jobs/history 不带 user_id → 拿到自己的
- [ ] super_admin 访问 /api/ai-jobs/history?user_id=X → 拿到指定用户的
- [ ] 非 super_admin 访问 /api/ai-jobs/users 返回 403
- [ ] 非 super_admin 访问 /api/prompt-templates 任何接口返回 403

---

## 已知局限 & 后续改进

- 内存队列：PM2 重启会丢失未完成任务（数据库仍有 pending/processing 记录，但不会自动重拾）
- 本地图片存储：没有 COS/CDN，服务器磁盘会逐渐增长（以后可加定时清理）
- 单模型支持：只有 Gemini 系列能做图像生成，OpenAI/Claude 的图像生成没实现
- 无速率限制：单个用户可以短时间大量提交（但总任务数 50 和并发 3 已提供一定保护）
