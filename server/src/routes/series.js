const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireModule } = require('../middleware/permission');

const router = express.Router();

// GET /api/series?season_id=&category=
router.get('/', auth, async (req, res, next) => {
  try {
    let sql = 'SELECT s.id, s.season_id, s.category, s.name, s.description, se.name AS season_name FROM series s JOIN seasons se ON s.season_id = se.id WHERE 1=1';
    const params = [];

    if (req.query.season_id) {
      sql += ' AND s.season_id = ?';
      params.push(req.query.season_id);
    }
    if (req.query.category) {
      sql += ' AND s.category = ?';
      params.push(req.query.category);
    }

    sql += ' ORDER BY se.year DESC, s.name';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/series
router.post('/', auth, requireModule('series'), async (req, res, next) => {
  try {
    const { season_id, category, name, description } = req.body;
    if (!season_id || !category || !name) {
      return res.status(400).json({ message: '请填写完整信息' });
    }

    const [result] = await pool.query(
      'INSERT INTO series (season_id, category, name, description) VALUES (?, ?, ?, ?)',
      [season_id, category, name, description || null]
    );
    res.status(201).json({ id: result.insertId, season_id, category, name, description });
  } catch (err) {
    next(err);
  }
});

// PUT /api/series/:id
router.put('/:id', auth, requireModule('series'), async (req, res, next) => {
  try {
    const { name, description, category } = req.body;
    await pool.query(
      'UPDATE series SET name = COALESCE(?, name), description = COALESCE(?, description), category = COALESCE(?, category) WHERE id = ?',
      [name || null, description || null, category || null, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/series/:id
router.delete('/:id', auth, requireModule('series'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM series WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
