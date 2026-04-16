const pool = require('../config/db');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

async function logOperation(req, action, detail) {
  try {
    const userId = req.user?.id;
    const username = req.user?.username || '';
    const ip = getClientIp(req);
    await pool.query(
      'INSERT INTO operation_logs (user_id, username, action, detail, ip) VALUES (?, ?, ?, ?, ?)',
      [userId, username, action, detail, ip]
    );
  } catch (err) {
    console.error('记录操作日志失败:', err.message);
  }
}

async function logLogin(req, userId, username) {
  try {
    const ip = getClientIp(req);
    await pool.query(
      'INSERT INTO operation_logs (user_id, username, action, detail, ip) VALUES (?, ?, ?, ?, ?)',
      [userId, username, '登录', '用户登录系统', ip]
    );
  } catch (err) {
    console.error('记录登录日志失败:', err.message);
  }
}

module.exports = { logOperation, logLogin };
