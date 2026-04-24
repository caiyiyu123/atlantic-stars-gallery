const pool = require('../config/db');

const DEFAULT_PROMPT = `Transform this product photograph into a professional e-commerce main image with the following specifications:

- Pure white background (#FFFFFF), seamless and uniform
- Keep the product's original colors, materials, textures, and details intact — do not alter the product itself
- Remove all shadows, reflections, and environmental elements
- Add subtle, soft ambient shadow beneath the product to ground it naturally
- High resolution, sharp focus, studio-quality lighting
- Center composition with appropriate whitespace margins
- Photorealistic, suitable for premium e-commerce platforms like Amazon, Tmall, Shopify`;

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_default (is_default)
      )
    `);
    console.log('prompt_templates 表创建成功');

    // 植入默认模板（仅在为空时）
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM prompt_templates');
    if (rows[0].cnt === 0) {
      await pool.query(
        'INSERT INTO prompt_templates (name, content, is_default) VALUES (?, ?, 1)',
        ['白底主图', DEFAULT_PROMPT]
      );
      console.log('已植入默认模板「白底主图」');
    }
    process.exit();
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
