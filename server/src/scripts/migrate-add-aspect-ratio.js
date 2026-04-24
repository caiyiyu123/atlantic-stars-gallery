const pool = require('../config/db');

async function migrate() {
  try {
    const [cols] = await pool.query(
      "SHOW COLUMNS FROM ai_image_jobs LIKE 'aspect_ratio'"
    );
    if (cols.length > 0) {
      console.log('aspect_ratio 字段已存在，跳过');
      process.exit();
    }
    await pool.query(
      "ALTER TABLE ai_image_jobs ADD COLUMN aspect_ratio VARCHAR(10) DEFAULT '1:1' AFTER prompt_snapshot"
    );
    console.log('ai_image_jobs.aspect_ratio 字段新增成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
