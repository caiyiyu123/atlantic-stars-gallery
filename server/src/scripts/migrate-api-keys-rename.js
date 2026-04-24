const pool = require('../config/db');

async function migrate() {
  try {
    // 检查当前字段名
    const [cols] = await pool.query(
      "SHOW COLUMNS FROM api_keys LIKE 'label'"
    );
    if (cols.length === 0) {
      console.log('label 字段不存在，已跳过（可能已重命名为 name）');
      process.exit();
    }
    await pool.query(
      "ALTER TABLE api_keys CHANGE label name VARCHAR(100) DEFAULT ''"
    );
    console.log('api_keys.label → name 重命名成功');
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
