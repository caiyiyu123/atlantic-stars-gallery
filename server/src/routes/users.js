const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

const router = express.Router();

const canManageUsers = requireRole('super_admin', 'admin');

// GET /api/users
router.get('/', auth, canManageUsers, async (req, res, next) => {
  try {
    let sql = 'SELECT id, username, role, display_name, created_at FROM users';
    if (req.user.role === 'admin') {
      sql += " WHERE role = 'operator'";
    }
    sql += ' ORDER BY created_at';
    const [rows] = await pool.query(sql);

    const userIds = rows.map(r => r.id);
    let permMap = {};
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const [perms] = await pool.query(
        `SELECT user_id, module FROM user_permissions WHERE user_id IN (${placeholders})`,
        userIds
      );
      for (const p of perms) {
        if (!permMap[p.user_id]) permMap[p.user_id] = [];
        permMap[p.user_id].push(p.module);
      }
    }

    const result = rows.map(r => ({
      ...r,
      permissions: permMap[r.id] || [],
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', auth, canManageUsers, async (req, res, next) => {
  try {
    const { username, password, role, permissions } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '请填写完整信息' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    const validRoles = ['admin', 'operator'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }
    if (req.user.role === 'admin' && role !== 'operator') {
      return res.status(403).json({ message: '管理员只能创建运营账号' });
    }

    const hash = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
        [username, hash, role, username]
      );
      if (role === 'operator' && Array.isArray(permissions) && permissions.length > 0) {
        const validModules = ['gallery', 'products', 'series'];
        for (const mod of permissions.filter(p => validModules.includes(p))) {
          await conn.query('INSERT INTO user_permissions (user_id, module) VALUES (?, ?)', [result.insertId, mod]);
        }
      }
      await conn.commit();
      res.status(201).json({ id: result.insertId, username, role, display_name: username, permissions: permissions || [] });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名已存在' });
    }
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { role, permissions } = req.body;

    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    const targetRole = targets[0].role;

    if (targetRole === 'super_admin') {
      return res.status(403).json({ message: '不能修改主管理员' });
    }
    if (req.user.role === 'admin' && targetRole !== 'operator') {
      return res.status(403).json({ message: '管理员只能修改运营账号' });
    }
    if (req.user.role === 'admin' && role && role !== 'operator') {
      return res.status(403).json({ message: '管理员只能设置运营角色' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (role) {
        await conn.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
      }
      const finalRole = role || targetRole;
      if (finalRole === 'operator' && Array.isArray(permissions)) {
        await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetId]);
        const validModules = ['gallery', 'products', 'series'];
        for (const mod of permissions.filter(p => validModules.includes(p))) {
          await conn.query('INSERT INTO user_permissions (user_id, module) VALUES (?, ?)', [targetId, mod]);
        }
      }
      if (role === 'admin' && targetRole === 'operator') {
        await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetId]);
      }
      await conn.commit();
      res.json({ message: '更新成功' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/users/transfer-super-admin
router.post('/transfer-super-admin', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { targetUserId, password } = req.body;
    if (!targetUserId || !password) {
      return res.status(400).json({ message: '请提供目标用户和密码' });
    }
    const [currentUser] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, currentUser[0].password_hash);
    if (!valid) {
      return res.status(400).json({ message: '密码错误' });
    }
    const [targets] = await pool.query('SELECT id, role FROM users WHERE id = ?', [targetUserId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '目标用户不存在' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE users SET role = 'super_admin' WHERE id = ?", [targetUserId]);
      await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetUserId]);
      await conn.query("UPDATE users SET role = 'admin' WHERE id = ?", [req.user.id]);
      await conn.commit();
      res.json({ message: '主管理员移交成功' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    if (targets[0].role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: '不能重置主管理员密码' });
    }
    if (req.user.role === 'admin' && targets[0].role !== 'operator') {
      return res.status(403).json({ message: '管理员只能重置运营账号密码' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, targetId]);
    res.json({ message: '密码重置成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }
    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    if (targets[0].role === 'super_admin') {
      return res.status(403).json({ message: '不能删除主管理员' });
    }
    if (req.user.role === 'admin' && targets[0].role !== 'operator') {
      return res.status(403).json({ message: '管理员只能删除运营账号' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [targetId]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
