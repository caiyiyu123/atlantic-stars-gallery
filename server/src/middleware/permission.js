const pool = require('../config/db');

// Check user role is in allowed list
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }
    next();
  };
}

// Check user has module permission
// super_admin and admin always pass
function requireModule(module) {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }
    try {
      const [rows] = await pool.query(
        'SELECT 1 FROM user_permissions WHERE user_id = ? AND module = ?',
        [req.user.id, module]
      );
      if (rows.length === 0) {
        return res.status(403).json({ message: '无此模块权限' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireRole, requireModule };
