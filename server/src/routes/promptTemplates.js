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
