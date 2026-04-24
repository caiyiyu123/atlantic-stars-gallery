const pool = require('../config/db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_image_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        batch_id VARCHAR(32) NOT NULL,
        api_key_id INT NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        prompt_template_id INT,
        prompt_snapshot TEXT,
        original_image_path VARCHAR(500) NOT NULL,
        result_image_path VARCHAR(500) DEFAULT '',
        status VARCHAR(20) DEFAULT 'pending',
        error_message VARCHAR(500) DEFAULT '',
        duration_ms INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP NULL,
        INDEX idx_user (user_id),
        INDEX idx_batch (batch_id),
        INDEX idx_status (status)
      )
    `);
    console.log('ai_image_jobs 表创建成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
