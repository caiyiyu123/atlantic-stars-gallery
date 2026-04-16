const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

const router = express.Router();

// GET /api/logs/:userId?page=1&limit=50
router.get('/:userId', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM operation_logs WHERE user_id = ?',
      [userId]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      'SELECT id, action, detail, ip, created_at FROM operation_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    res.json({
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
