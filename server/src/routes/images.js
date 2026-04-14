const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const cosService = require('../services/cosService');
const zipService = require('../services/zipService');
const config = require('../config/env');

const router = express.Router();

// POST /api/images/upload-token
router.post('/upload-token', auth, admin, async (req, res, next) => {
  try {
    const { prefix } = req.body;
    if (!prefix) {
      return res.status(400).json({ message: '请提供上传路径前缀' });
    }
    const credential = await cosService.getTempCredential(prefix);
    res.json(credential);
  } catch (err) {
    next(err);
  }
});

// POST /api/images
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const { product_id, cos_key, file_size } = req.body;
    if (!product_id || !cos_key) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    const [maxSort] = await pool.execute(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM product_images WHERE product_id = ?',
      [product_id]
    );
    const sortOrder = maxSort[0].max_sort + 1;

    const originalUrl = `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/${cos_key}`;
    const thumbnailUrl = cosService.getThumbnailUrl(originalUrl);

    const [result] = await pool.execute(
      'INSERT INTO product_images (product_id, cos_key, thumbnail_url, original_url, file_size, sort_order, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, cos_key, thumbnailUrl, originalUrl, file_size || 0, sortOrder, req.user.id]
    );

    res.status(201).json({
      id: result.insertId,
      cos_key,
      thumbnail_url: thumbnailUrl,
      original_url: originalUrl,
      sort_order: sortOrder,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/images/sort
router.put('/sort', auth, admin, async (req, res, next) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ message: '参数格式错误' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const item of orders) {
        await conn.execute(
          'UPDATE product_images SET sort_order = ? WHERE id = ?',
          [item.sort_order, item.id]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ message: '排序更新成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/images/:id
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT cos_key FROM product_images WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: '图片不存在' });
    }

    try {
      await cosService.deleteObject(rows[0].cos_key);
    } catch (cosErr) {
      console.error('COS delete error:', cosErr.message);
    }

    await pool.execute('DELETE FROM product_images WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

// POST /api/images/download
router.post('/download', auth, async (req, res, next) => {
  try {
    const { product_ids } = req.body;
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ message: '请选择要下载的产品' });
    }

    const placeholders = product_ids.map(() => '?').join(',');
    const [images] = await pool.execute(
      `SELECT pi.cos_key, pi.sort_order, p.sku
       FROM product_images pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.product_id IN (${placeholders})
       ORDER BY p.sku, pi.sort_order`,
      product_ids
    );

    if (images.length === 0) {
      return res.status(404).json({ message: '没有可下载的图片' });
    }

    const files = images.map(img => {
      const ext = img.cos_key.split('.').pop();
      return {
        key: img.cos_key,
        name: `${img.sku}/${img.sort_order}.${ext}`,
      };
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=atlantic-stars-images.zip');

    await zipService.createZipStream(files, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
