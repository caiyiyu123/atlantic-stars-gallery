const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/env');
require('./config/db'); // 启动时测试数据库连接

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));
app.use(morgan('dev'));
app.use(express.json());

// 静态文件服务 - 本地上传的图片
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/series', require('./routes/series'));
app.use('/api/products', require('./routes/products'));
app.use('/api/images', require('./routes/images'));
app.use('/api/users', require('./routes/users'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

module.exports = app;
