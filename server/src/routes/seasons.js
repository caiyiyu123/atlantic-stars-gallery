const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireModule } = require('../middleware/permission');

const router = express.Router();

// GET /api/seasons
router.get('/', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, year, season, name FROM seasons ORDER BY year DESC, FIELD(season, "FW", "SS")'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/seasons
router.post('/', auth, requireModule('series'), async (req, res, next) => {
  try {
    const { year, season } = req.body;
    if (!year || !season) {
      return res.status(400).json({ message: '请填写年份和季节' });
    }
    const name = `${year} ${season}`;
    const [result] = await pool.query(
      'INSERT INTO seasons (year, season, name) VALUES (?, ?, ?)',
      [year, season, name]
    );
    res.status(201).json({ id: result.insertId, year, season, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '该季度已存在' });
    }
    next(err);
  }
});

// DELETE /api/seasons/:id
router.delete('/:id', auth, requireModule('series'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM seasons WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
