const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const { logOperation } = require('../middleware/operationLog');
const { testConnectivity } = require('../services/aiService');

const router = express.Router();

// 掩码 key，仅返回前6后4
function maskKey(key) {
  if (!key) return '';
  if (key.length <= 10) return '****';
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

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

const VALID_PROVIDERS = ['gemini', 'openai', 'claude'];

// GET /api/api-keys
router.get('/', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM api_keys ORDER BY created_at DESC');
    res.json(rows.map(formatRow));
  } catch (err) {
    next(err);
  }
});

// POST /api/api-keys
router.post('/', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { provider, model_name, api_key, name } = req.body;
    if (!provider || !model_name || !api_key) {
      return res.status(400).json({ message: '请填写服务商、模型名和 API Key' });
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: '无效的服务商' });
    }
    const [result] = await pool.query(
      'INSERT INTO api_keys (provider, model_name, api_key, name) VALUES (?, ?, ?, ?)',
      [provider, model_name, api_key, name || '']
    );
    logOperation(req, '新增API Key', `${provider} / ${model_name}`);
    const [rows] = await pool.query('SELECT * FROM api_keys WHERE id = ?', [result.insertId]);
    res.status(201).json(formatRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/api-keys/:id
router.put('/:id', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { provider, model_name, api_key, name, is_active } = req.body;
    const id = parseInt(req.params.id, 10);
    const fields = [];
    const values = [];
    if (provider !== undefined) {
      if (!VALID_PROVIDERS.includes(provider)) {
        return res.status(400).json({ message: '无效的服务商' });
      }
      fields.push('provider = ?');
      values.push(provider);
    }
    if (model_name !== undefined) {
      fields.push('model_name = ?');
      values.push(model_name);
    }
    if (api_key !== undefined && api_key !== '') {
      fields.push('api_key = ?');
      values.push(api_key);
    }
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (fields.length === 0) {
      return res.status(400).json({ message: '没有可更新字段' });
    }
    values.push(id);
    await pool.query(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`, values);
    logOperation(req, '编辑API Key', `ID: ${id}`);
    const [rows] = await pool.query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    res.json(formatRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/api-keys/:id
router.delete('/:id', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM api_keys WHERE id = ?', [id]);
    logOperation(req, '删除API Key', `ID: ${id}`);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

// POST /api/api-keys/:id/test - 测试连通性
router.post('/:id/test', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    const row = rows[0];

    let status = 'success';
    let errorMsg = '';
    let reply = '';
    try {
      reply = await testConnectivity(row.provider, row.model_name, row.api_key);
    } catch (err) {
      status = 'failed';
      errorMsg = err.message.slice(0, 500);
    }

    await pool.query(
      'UPDATE api_keys SET last_tested_at = NOW(), last_test_status = ?, last_test_error = ? WHERE id = ?',
      [status, errorMsg, id]
    );
    logOperation(req, '测试API Key', `ID: ${id}, ${status}`);

    if (status === 'success') {
      res.json({ status, reply });
    } else {
      res.status(400).json({ status, error: errorMsg });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
