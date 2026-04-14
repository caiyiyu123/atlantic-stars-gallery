const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

// GET /api/users
router.get('/', auth, admin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, display_name, created_at FROM users ORDER BY created_at'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '请填写完整信息' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    const validRoles = ['admin', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
      [username, hash, role || 'viewer', username]
    );

    res.status(201).json({ id: result.insertId, username, role: role || 'viewer', display_name: username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名已存在' });
    }
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', auth, admin, async (req, res, next) => {
  try {
    const { role, display_name } = req.body;
    await pool.query(
      'UPDATE users SET role = COALESCE(?, role), display_name = COALESCE(?, display_name) WHERE id = ?',
      [role || null, display_name || null, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', auth, admin, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, req.params.id]
    );
    res.json({ message: '密码重置成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    if (parseInt(req.params.id, 10) === req.user.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
