const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireModule } = require('../middleware/permission');
const config = require('../config/env');

const router = express.Router();
const uploadsDir = path.resolve(__dirname, '../../uploads');

// 安全路径校验
function safePath(base, rel) {
  const full = path.resolve(base, rel);
  if (!full.startsWith(base)) return null;
  return full;
}

// multer 配置 - 本地存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pid = req.body.product_id;
    if (!pid || !/^\d+$/.test(pid)) return cb(new Error('Invalid product_id'));
    const dir = path.join(uploadsDir, pid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/images/upload - 本地上传
router.post('/upload', auth, requireModule('products'), upload.array('files', 20), async (req, res, next) => {
  try {
    const { product_id } = req.body;
    if (!product_id || !req.files || req.files.length === 0) {
      return res.status(400).json({ message: '缺少产品ID或文件' });
    }

    const [maxSort] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM product_images WHERE product_id = ?',
      [product_id]
    );
    let sortOrder = maxSort[0].max_sort;

    const results = [];
    for (const file of req.files) {
      sortOrder++;
      const relativePath = `uploads/${product_id}/${file.filename}`;
      const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
      const originalUrl = `${baseUrl}/${relativePath}`;
      const thumbnailUrl = originalUrl;

      const [result] = await pool.query(
        'INSERT INTO product_images (product_id, cos_key, thumbnail_url, original_url, file_size, sort_order, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [product_id, relativePath, thumbnailUrl, originalUrl, file.size, sortOrder, req.user.id]
      );

      results.push({
        id: result.insertId,
        thumbnail_url: thumbnailUrl,
        original_url: originalUrl,
        sort_order: sortOrder,
      });
    }

    res.status(201).json({ uploaded: results.length, images: results });
  } catch (err) {
    next(err);
  }
});

// POST /api/images/upload-token (COS模式 - 需要COS配置)
router.post('/upload-token', auth, requireModule('products'), async (req, res, next) => {
  try {
    const cosService = require('../services/cosService');
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

// POST /api/images (COS模式 - 注册图片记录)
router.post('/', auth, requireModule('products'), async (req, res, next) => {
  try {
    const { product_id, cos_key, file_size } = req.body;
    if (!product_id || !cos_key) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    const [maxSort] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM product_images WHERE product_id = ?',
      [product_id]
    );
    const sortOrder = maxSort[0].max_sort + 1;

    const cosService = require('../services/cosService');
    const originalUrl = `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/${cos_key}`;
    const thumbnailUrl = cosService.getThumbnailUrl(originalUrl);

    const [result] = await pool.query(
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
router.put('/sort', auth, requireModule('products'), async (req, res, next) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ message: '参数格式错误' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const item of orders) {
        await conn.query(
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
router.delete('/:id', auth, requireModule('products'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT cos_key FROM product_images WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: '图片不存在' });
    }

    // 尝试删除本地文件
    const localPath = safePath(uploadsDir, path.relative('uploads', rows[0].cos_key));
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    } else {
      // 尝试COS删除
      try {
        const cosService = require('../services/cosService');
        await cosService.deleteObject(rows[0].cos_key);
      } catch (cosErr) {
        console.error('COS delete error:', cosErr.message);
      }
    }

    await pool.query('DELETE FROM product_images WHERE id = ?', [req.params.id]);
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
    if (product_ids.length > 50) {
      return res.status(400).json({ message: '单次最多下载50个产品' });
    }

    const placeholders = product_ids.map(() => '?').join(',');
    const [images] = await pool.query(
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

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 5 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=atlantic-stars-images.zip');

    archive.pipe(res);

    for (const img of images) {
      const localPath = safePath(uploadsDir, path.relative('uploads', img.cos_key));
      if (localPath && fs.existsSync(localPath)) {
        const ext = img.cos_key.split('.').pop();
        archive.file(localPath, { name: `${img.sku}/${img.sort_order}.${ext}` });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: '下载失败' });
    }
  }
});

module.exports = router;
