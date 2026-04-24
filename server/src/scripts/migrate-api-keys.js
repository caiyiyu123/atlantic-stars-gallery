const pool = require('../config/db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider VARCHAR(20) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        api_key TEXT NOT NULL,
        label VARCHAR(100) DEFAULT '',
        is_active TINYINT(1) DEFAULT 1,
        call_count INT DEFAULT 0,
        last_used_at TIMESTAMP NULL DEFAULT NULL,
        last_tested_at TIMESTAMP NULL DEFAULT NULL,
        last_test_status VARCHAR(20) DEFAULT '',
        last_test_error VARCHAR(500) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_provider (provider),
        INDEX idx_is_active (is_active)
      )
    `);
    console.log('api_keys 表创建成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
