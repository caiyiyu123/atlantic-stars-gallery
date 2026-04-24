const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const config = require('../config/env');
const auth = require('../middleware/auth');
const { logLogin } = require('../middleware/operationLog');

const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: '登录尝试过多，请15分钟后再试' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, display_name FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    let permissions = ['gallery', 'products', 'series', 'as_ai'];
    if (user.role === 'operator') {
      const [perms] = await pool.query(
        'SELECT module FROM user_permissions WHERE user_id = ?',
        [user.id]
      );
      permissions = perms.map(p => p.module);
    }

    // 记录登录日志（不阻塞响应）
    logLogin(req, user.id, user.username);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
        permissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: '请输入旧密码和新密码' });
    }

    const [rows] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ message: '旧密码错误' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, req.user.id]
    );

    res.json({ message: '密码修改成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
