const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

// GET /api/products?page=1&limit=20&year=&season=&category=&series_id=&keyword=
router.get('/', auth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (req.query.year) {
      where += ' AND se.year = ?';
      params.push(req.query.year);
    }
    if (req.query.season) {
      where += ' AND se.season = ?';
      params.push(req.query.season);
    }
    if (req.query.category) {
      where += ' AND sr.category = ?';
      params.push(req.query.category);
    }
    if (req.query.series_id) {
      where += ' AND p.series_id = ?';
      params.push(req.query.series_id);
    }
    if (req.query.keyword) {
      where += ' AND (p.sku LIKE ? OR p.color_name LIKE ? OR sr.name LIKE ?)';
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw, kw);
    }

    const countSql = `SELECT COUNT(*) AS total FROM products p
      JOIN series sr ON p.series_id = sr.id
      JOIN seasons se ON sr.season_id = se.id
      ${where}`;
    const [countRows] = await pool.execute(countSql, params);
    const total = countRows[0].total;

    const dataSql = `
      SELECT p.id, p.sku, p.color_name, p.material, p.size_range,
             p.series_id, sr.name AS series_name, sr.season_id, sr.category,
             se.year, se.season, se.name AS season_name,
             (SELECT thumbnail_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS cover_image,
             (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS image_count
      FROM products p
      JOIN series sr ON p.series_id = sr.id
      JOIN seasons se ON sr.season_id = se.id
      ${where}
      ORDER BY se.year DESC, p.created_at DESC
      LIMIT ? OFFSET ?`;

    const dataParams = [...params, limit, offset];
    const [rows] = await pool.execute(dataSql, dataParams);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const [products] = await pool.execute(
      `SELECT p.*, sr.name AS series_name, sr.category,
              se.year, se.season, se.name AS season_name
       FROM products p
       JOIN series sr ON p.series_id = sr.id
       JOIN seasons se ON sr.season_id = se.id
       WHERE p.id = ?`,
      [req.params.id]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: '产品不存在' });
    }

    const [images] = await pool.execute(
      'SELECT id, cos_key, thumbnail_url, original_url, file_size, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [req.params.id]
    );

    res.json({ ...products[0], images });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const { series_id, sku, color_name, material, size_range } = req.body;
    if (!series_id || !sku || !color_name) {
      return res.status(400).json({ message: '请填写系列、款号和颜色' });
    }

    const [result] = await pool.execute(
      'INSERT INTO products (series_id, sku, color_name, material, size_range) VALUES (?, ?, ?, ?, ?)',
      [series_id, sku, color_name, material || null, size_range || null]
    );

    res.status(201).json({ id: result.insertId, series_id, sku, color_name, material, size_range });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '款号已存在' });
    }
    next(err);
  }
});

// PUT /api/products/:id
router.put('/:id', auth, admin, async (req, res, next) => {
  try {
    const { series_id, sku, color_name, material, size_range } = req.body;
    await pool.execute(
      `UPDATE products SET
        series_id = COALESCE(?, series_id),
        sku = COALESCE(?, sku),
        color_name = COALESCE(?, color_name),
        material = COALESCE(?, material),
        size_range = COALESCE(?, size_range)
       WHERE id = ?`,
      [series_id || null, sku || null, color_name || null, material || null, size_range || null, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
