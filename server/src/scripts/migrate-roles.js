/**
 * 数据库迁移脚本：角色权限系统重构
 *
 * 变更内容：
 * 1. users.role 枚举从 ('admin','viewer') 改为 ('super_admin','admin','operator')
 * 2. 数据迁移：最早的 admin 变为 super_admin，其余 admin 不变，viewer 变为 operator
 * 3. 新建 user_permissions 表
 * 4. 为所有 operator 用户授予全部三个模块权限
 *
 * 用法: node server/src/scripts/migrate-roles.js
 */

const pool = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    console.log('开始迁移...');

    // ========== 第一步：修改 role 列 ==========

    // 1a. 将 ENUM 列转为 VARCHAR，以便自由修改数据
    await connection.execute(
      `ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'viewer'`
    );
    console.log('role 列已转为 VARCHAR');

    // 1b. 找到最早的 admin 用户（最小 id），将其改为 super_admin
    const [admins] = await connection.execute(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC`
    );

    if (admins.length > 0) {
      const firstAdminId = admins[0].id;
      await connection.execute(
        `UPDATE users SET role = 'super_admin' WHERE id = ?`,
        [firstAdminId]
      );
      console.log(`用户 id=${firstAdminId} 已升级为 super_admin`);
      // 其余 admin 保持 'admin' 不变
    }

    // 1c. 将所有 viewer 改为 operator
    const [viewerResult] = await connection.execute(
      `UPDATE users SET role = 'operator' WHERE role = 'viewer'`
    );
    console.log(`${viewerResult.affectedRows} 个 viewer 用户已转为 operator`);

    // 1d. 将 VARCHAR 列转回新的 ENUM
    await connection.execute(
      `ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','admin','operator') NOT NULL DEFAULT 'operator'`
    );
    console.log('role 列已转为新 ENUM');

    // ========== 第二步：创建 user_permissions 表 ==========

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        module ENUM('gallery','products','series') NOT NULL,
        UNIQUE KEY uk_user_module (user_id, module),
        CONSTRAINT fk_user_permissions_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
      )
    `);
    console.log('user_permissions 表已创建');

    // ========== 第三步：为所有 operator 授予全部模块权限 ==========

    const [operators] = await connection.execute(
      `SELECT id FROM users WHERE role = 'operator'`
    );

    const modules = ['gallery', 'products', 'series'];
    let permCount = 0;

    for (const user of operators) {
      for (const mod of modules) {
        await connection.execute(
          `INSERT IGNORE INTO user_permissions (user_id, module) VALUES (?, ?)`,
          [user.id, mod]
        );
        permCount++;
      }
    }
    console.log(`已为 ${operators.length} 个 operator 用户插入 ${permCount} 条权限记录`);

    // ========== 提交事务 ==========

    await connection.commit();
    console.log('迁移完成！');
  } catch (err) {
    await connection.rollback();
    console.error('迁移失败，已回滚：', err);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate();
