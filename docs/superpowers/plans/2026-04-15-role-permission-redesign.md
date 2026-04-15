# 角色权限系统重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将双角色系统(admin/viewer)重构为三级角色体系(super_admin/admin/operator)，支持模块级权限控制。

**Architecture:** 后端新增权限中间件替代 admin.js，新增 user_permissions 表存储运营模块权限。前端 auth store 扩展权限计算，路由守卫和导航菜单根据角色和模块权限动态控制。

**Tech Stack:** Node.js/Express, MySQL, Vue 3/Pinia/Element Plus

---

### Task 1: 数据库变更 — 修改角色枚举 + 新增权限表

**Files:**
- Create: `server/src/scripts/migrate-roles.js`

- [ ] **Step 1: 创建数据库迁移脚本**

```js
// server/src/scripts/migrate-roles.js
const pool = require('../config/db');

async function migrate() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 修改 role 枚举 — 先改为 VARCHAR 过渡
    await conn.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'operator'");

    // 2. 迁移数据：第一个 admin 变为 super_admin，viewer 变为 operator
    const [admins] = await conn.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    if (admins.length > 0) {
      await conn.query("UPDATE users SET role = 'super_admin' WHERE id = ?", [admins[0].id]);
    }
    await conn.query("UPDATE users SET role = 'operator' WHERE role = 'viewer'");

    // 3. 改回 ENUM
    await conn.query("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'admin', 'operator') NOT NULL DEFAULT 'operator'");

    // 4. 创建 user_permissions 表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        module ENUM('gallery', 'products', 'series') NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_module (user_id, module)
      )
    `);

    // 5. 为所有 operator 用户赋予全部模块权限
    const [operators] = await conn.query("SELECT id FROM users WHERE role = 'operator'");
    for (const op of operators) {
      await conn.query("INSERT IGNORE INTO user_permissions (user_id, module) VALUES (?, 'gallery'), (?, 'products'), (?, 'series')", [op.id, op.id, op.id]);
    }

    await conn.commit();
    console.log('Migration completed successfully');
  } catch (err) {
    await conn.rollback();
    console.error('Migration failed:', err);
  } finally {
    conn.release();
    process.exit();
  }
}

migrate();
```

- [ ] **Step 2: 在本地运行迁移脚本**

运行：`cd server && node src/scripts/migrate-roles.js`

预期输出：`Migration completed successfully`

- [ ] **Step 3: 验证数据库变更**

运行：`cd server && node -e "const pool = require('./src/config/db'); (async()=>{const [r]=await pool.query('SELECT id,username,role FROM users');console.log(r);const [p]=await pool.query('SELECT * FROM user_permissions');console.log(p);process.exit()})()"`

预期：第一个admin用户role为super_admin，其他admin保持admin，原viewer变为operator，operator有权限记录。

- [ ] **Step 4: 提交**

```bash
git add server/src/scripts/migrate-roles.js
git commit -m "feat: add role migration script (super_admin/admin/operator)"
```

---

### Task 2: 后端权限中间件重构

**Files:**
- Modify: `server/src/middleware/admin.js`
- Create: `server/src/middleware/permission.js`

- [ ] **Step 1: 创建新的权限中间件**

```js
// server/src/middleware/permission.js
const pool = require('../config/db');

// 检查用户角色是否在允许列表中
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }
    next();
  };
}

// 检查用户是否有指定模块权限
// super_admin 和 admin 默认拥有所有模块权限
function requireModule(module) {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }
    try {
      const [rows] = await pool.query(
        'SELECT 1 FROM user_permissions WHERE user_id = ? AND module = ?',
        [req.user.id, module]
      );
      if (rows.length === 0) {
        return res.status(403).json({ message: '无此模块权限' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireRole, requireModule };
```

- [ ] **Step 2: 更新 admin.js 保持向后兼容**

```js
// server/src/middleware/admin.js
module.exports = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
};
```

- [ ] **Step 3: 提交**

```bash
git add server/src/middleware/permission.js server/src/middleware/admin.js
git commit -m "feat: add role and module permission middleware"
```

---

### Task 3: 后端路由权限更新

**Files:**
- Modify: `server/src/routes/products.js`
- Modify: `server/src/routes/series.js`
- Modify: `server/src/routes/seasons.js`
- Modify: `server/src/routes/images.js`

- [ ] **Step 1: 更新 products.js 路由权限**

将 `products.js` 中的写操作中间件从 `auth, admin` 改为使用 `requireModule('products')`：

```js
// 文件顶部添加引用（替换 admin 引用）
const { requireModule } = require('../middleware/permission');

// POST /api/products — 第106行
router.post('/', auth, requireModule('products'), async (req, res, next) => {

// PUT /api/products/:id — 第128行
router.put('/:id', auth, requireModule('products'), async (req, res, next) => {

// DELETE /api/products/:id — 第148行
router.delete('/:id', auth, requireModule('products'), async (req, res, next) => {
```

删除文件顶部的 `const admin = require('../middleware/admin');`。

- [ ] **Step 2: 更新 series.js 路由权限**

```js
// 文件顶部替换 admin 引用
const { requireModule } = require('../middleware/permission');

// POST /api/series — 第32行
router.post('/', auth, requireModule('series'), async (req, res, next) => {

// PUT /api/series/:id — 第50行
router.put('/:id', auth, requireModule('series'), async (req, res, next) => {

// DELETE /api/series/:id — 第64行
router.delete('/:id', auth, requireModule('series'), async (req, res, next) => {
```

- [ ] **Step 3: 更新 seasons.js 路由权限**

```js
// 文件顶部替换 admin 引用
const { requireModule } = require('../middleware/permission');

// POST /api/seasons — 第21行
router.post('/', auth, requireModule('series'), async (req, res, next) => {

// DELETE /api/seasons/:id — 第42行
router.delete('/:id', auth, requireModule('series'), async (req, res, next) => {
```

注意：季度管理归属于 `series` 模块。

- [ ] **Step 4: 更新 images.js 路由权限**

```js
// 文件顶部添加引用（替换 admin 引用）
const { requireModule } = require('../middleware/permission');

// POST /api/images/upload — 第46行
router.post('/upload', auth, requireModule('products'), upload.array('files', 20), async (req, res, next) => {

// POST /api/images/upload-token — 第87行
router.post('/upload-token', auth, requireModule('products'), async (req, res, next) => {

// POST /api/images — 第102行
router.post('/', auth, requireModule('products'), async (req, res, next) => {

// PUT /api/images/sort — 第137行
router.put('/sort', auth, requireModule('products'), async (req, res, next) => {

// DELETE /api/images/:id — 第168行
router.delete('/:id', auth, requireModule('products'), async (req, res, next) => {
```

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/products.js server/src/routes/series.js server/src/routes/seasons.js server/src/routes/images.js
git commit -m "feat: update route permissions to use module-based middleware"
```

---

### Task 4: 用户管理 API 重构

**Files:**
- Modify: `server/src/routes/users.js`

- [ ] **Step 1: 重写 users.js**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

const router = express.Router();

const canManageUsers = requireRole('super_admin', 'admin');

// GET /api/users
router.get('/', auth, canManageUsers, async (req, res, next) => {
  try {
    let sql = 'SELECT id, username, role, display_name, created_at FROM users';
    const params = [];

    if (req.user.role === 'admin') {
      sql += " WHERE role = 'operator'";
    }

    sql += ' ORDER BY created_at';
    const [rows] = await pool.query(sql, params);

    // 查询所有用户的模块权限
    const userIds = rows.map(r => r.id);
    let permMap = {};
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const [perms] = await pool.query(
        `SELECT user_id, module FROM user_permissions WHERE user_id IN (${placeholders})`,
        userIds
      );
      for (const p of perms) {
        if (!permMap[p.user_id]) permMap[p.user_id] = [];
        permMap[p.user_id].push(p.module);
      }
    }

    const result = rows.map(r => ({
      ...r,
      permissions: permMap[r.id] || [],
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', auth, canManageUsers, async (req, res, next) => {
  try {
    const { username, password, role, permissions } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '请填写完整信息' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }

    const validRoles = ['admin', 'operator'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }

    // admin 只能创建 operator
    if (req.user.role === 'admin' && role !== 'operator') {
      return res.status(403).json({ message: '管理员只能创建运营账号' });
    }

    const hash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
        [username, hash, role, username]
      );

      // operator 需要设置模块权限
      if (role === 'operator' && Array.isArray(permissions) && permissions.length > 0) {
        const validModules = ['gallery', 'products', 'series'];
        const filtered = permissions.filter(p => validModules.includes(p));
        for (const mod of filtered) {
          await conn.query(
            'INSERT INTO user_permissions (user_id, module) VALUES (?, ?)',
            [result.insertId, mod]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ id: result.insertId, username, role, display_name: username, permissions: permissions || [] });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名已存在' });
    }
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { role, permissions } = req.body;

    // 查询目标用户
    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const targetRole = targets[0].role;

    // 不能修改 super_admin
    if (targetRole === 'super_admin') {
      return res.status(403).json({ message: '不能修改主管理员' });
    }

    // admin 只能修改 operator
    if (req.user.role === 'admin' && targetRole !== 'operator') {
      return res.status(403).json({ message: '管理员只能修改运营账号' });
    }

    // admin 不能把 operator 升级为 admin
    if (req.user.role === 'admin' && role && role !== 'operator') {
      return res.status(403).json({ message: '管理员只能设置运营角色' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (role) {
        await conn.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
      }

      // 更新模块权限（仅 operator）
      const finalRole = role || targetRole;
      if (finalRole === 'operator' && Array.isArray(permissions)) {
        await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetId]);
        const validModules = ['gallery', 'products', 'series'];
        const filtered = permissions.filter(p => validModules.includes(p));
        for (const mod of filtered) {
          await conn.query(
            'INSERT INTO user_permissions (user_id, module) VALUES (?, ?)',
            [targetId, mod]
          );
        }
      }

      // 如果从 operator 升级为 admin，清除模块权限
      if (role === 'admin' && targetRole === 'operator') {
        await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetId]);
      }

      await conn.commit();
      res.json({ message: '更新成功' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }

    // 查询目标用户角色
    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 不能重置 super_admin 密码（除非自己是 super_admin）
    if (targets[0].role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: '不能重置主管理员密码' });
    }

    // admin 只能重置 operator 密码
    if (req.user.role === 'admin' && targets[0].role !== 'operator') {
      return res.status(403).json({ message: '管理员只能重置运营账号密码' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, targetId]);
    res.json({ message: '密码重置成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, canManageUsers, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }

    const [targets] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 不能删除 super_admin
    if (targets[0].role === 'super_admin') {
      return res.status(403).json({ message: '不能删除主管理员' });
    }

    // admin 只能删除 operator
    if (req.user.role === 'admin' && targets[0].role !== 'operator') {
      return res.status(403).json({ message: '管理员只能删除运营账号' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [targetId]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/transfer-super-admin
router.post('/transfer-super-admin', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { targetUserId, password } = req.body;
    if (!targetUserId || !password) {
      return res.status(400).json({ message: '请提供目标用户和密码' });
    }

    // 验证当前用户密码
    const [currentUser] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, currentUser[0].password_hash);
    if (!valid) {
      return res.status(400).json({ message: '密码错误' });
    }

    // 检查目标用户存在
    const [targets] = await pool.query('SELECT id, role FROM users WHERE id = ?', [targetUserId]);
    if (targets.length === 0) {
      return res.status(404).json({ message: '目标用户不存在' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 目标用户 → super_admin
      await conn.query("UPDATE users SET role = 'super_admin' WHERE id = ?", [targetUserId]);
      // 清除目标用户的模块权限（如果之前是 operator）
      await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [targetUserId]);
      // 当前用户 → admin
      await conn.query("UPDATE users SET role = 'admin' WHERE id = ?", [req.user.id]);

      await conn.commit();
      res.json({ message: '主管理员移交成功' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: 提交**

```bash
git add server/src/routes/users.js
git commit -m "feat: rewrite user management API with three-tier role system"
```

---

### Task 5: 登录接口返回权限信息

**Files:**
- Modify: `server/src/routes/auth.js`

- [ ] **Step 1: 更新登录接口**

在 `auth.js` 的 login 路由中，登录成功后查询用户权限并返回：

在 `res.json({` 之前（约第41行到第55行之间），添加权限查询逻辑。将原来的 token 生成和 res.json 替换为：

```js
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // 查询模块权限
    let permissions = ['gallery', 'products', 'series']; // super_admin 和 admin 默认全部
    if (user.role === 'operator') {
      const [perms] = await pool.query(
        'SELECT module FROM user_permissions WHERE user_id = ?',
        [user.id]
      );
      permissions = perms.map(p => p.module);
    }

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
        permissions,
      },
    });
```

- [ ] **Step 2: 提交**

```bash
git add server/src/routes/auth.js
git commit -m "feat: include permissions in login response"
```

---

### Task 6: 前端 Auth Store 扩展

**Files:**
- Modify: `client/src/stores/auth.js`

- [ ] **Step 1: 更新 auth store**

```js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));

  const isLoggedIn = computed(() => !!token.value);
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin');
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin');
  const isOperator = computed(() => user.value?.role === 'operator');

  function hasModule(module) {
    if (!user.value) return false;
    if (user.value.role === 'super_admin' || user.value.role === 'admin') return true;
    return user.value.permissions?.includes(module) || false;
  }

  function setAuth(tokenVal, userVal) {
    token.value = tokenVal;
    user.value = userVal;
    localStorage.setItem('token', tokenVal);
    localStorage.setItem('user', JSON.stringify(userVal));
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return { token, user, isLoggedIn, isSuperAdmin, isAdmin, isOperator, hasModule, setAuth, logout };
});
```

- [ ] **Step 2: 提交**

```bash
git add client/src/stores/auth.js
git commit -m "feat: extend auth store with three-tier role support"
```

---

### Task 7: 前端路由守卫更新

**Files:**
- Modify: `client/src/router/index.js`

- [ ] **Step 1: 更新路由 meta 和守卫**

```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'ProductList',
        component: () => import('../views/ProductListView.vue'),
        meta: { requiredModule: 'gallery' },
      },
      {
        path: 'product/:id',
        name: 'ProductDetail',
        component: () => import('../views/ProductDetailView.vue'),
        meta: { requiredModule: 'gallery' },
      },
      {
        path: 'admin/products',
        name: 'ProductManage',
        component: () => import('../views/admin/ProductManageView.vue'),
        meta: { requiredModule: 'products' },
      },
      {
        path: 'admin/series',
        name: 'SeriesManage',
        component: () => import('../views/admin/SeriesManageView.vue'),
        meta: { requiredModule: 'series' },
      },
      {
        path: 'admin/users',
        name: 'UserManage',
        component: () => import('../views/admin/UserManageView.vue'),
        meta: { requiredRole: ['super_admin', 'admin'] },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return next('/login');
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return next('/');
  }
  if (to.meta.requiredRole) {
    if (!to.meta.requiredRole.includes(auth.user?.role)) {
      return next('/');
    }
  }
  if (to.meta.requiredModule) {
    if (!auth.hasModule(to.meta.requiredModule)) {
      return next('/login');
    }
  }
  next();
});

export default router;
```

- [ ] **Step 2: 提交**

```bash
git add client/src/router/index.js
git commit -m "feat: update router guards for module-based permissions"
```

---

### Task 8: 前端导航菜单适配

**Files:**
- Modify: `client/src/components/AppNav.vue`

- [ ] **Step 1: 更新导航模板中的 v-if 条件**

将模板中的导航链接条件从 `auth.isAdmin` 改为模块权限检查：

```html
<!-- 产品图库 — 第13-15行 -->
<router-link v-if="auth.hasModule('gallery')" to="/" class="nav-link nav-link-yellow" :class="{ active: route.name === 'ProductList' }">
  产品图库
</router-link>

<!-- 产品管理 — 第16-18行 -->
<router-link v-if="auth.hasModule('products')" to="/admin/products" class="nav-link nav-link-orange" :class="{ active: route.name === 'ProductManage' }">
  产品管理
</router-link>

<!-- 系列管理 — 第19-21行 -->
<router-link v-if="auth.hasModule('series')" to="/admin/series" class="nav-link nav-link-red" :class="{ active: route.name === 'SeriesManage' }">
  系列管理
</router-link>
```

将下拉菜单中用户管理的条件更新（第30行）：

```html
<router-link v-if="auth.isAdmin" to="/admin/users" class="dropdown-item" @click="showDropdown = false">
  用户管理
</router-link>
```

`auth.isAdmin` 在新的 store 中已经包含 super_admin 和 admin，所以用户管理的条件不需要改。

产品图库链接增加了 `v-if="auth.hasModule('gallery')"` 条件，这样没有 gallery 权限的运营就看不到。

- [ ] **Step 2: 提交**

```bash
git add client/src/components/AppNav.vue
git commit -m "feat: update nav menu with module-based visibility"
```

---

### Task 9: 用户管理 API 客户端更新

**Files:**
- Modify: `client/src/api/users.js`

- [ ] **Step 1: 添加移交主管理员 API**

```js
import request from './request';
export const getUsers = () => request.get('/users');
export const createUser = (data) => request.post('/users', data);
export const updateUser = (id, data) => request.put(`/users/${id}`, data);
export const resetPassword = (id, newPassword) => request.post(`/users/${id}/reset-password`, { newPassword });
export const deleteUser = (id) => request.delete(`/users/${id}`);
export const transferSuperAdmin = (targetUserId, password) => request.post('/users/transfer-super-admin', { targetUserId, password });
```

- [ ] **Step 2: 提交**

```bash
git add client/src/api/users.js
git commit -m "feat: add transferSuperAdmin API"
```

---

### Task 10: 用户管理页面重写

**Files:**
- Modify: `client/src/views/admin/UserManageView.vue`

- [ ] **Step 1: 重写用户管理页面**

```vue
<template>
  <div>
    <div class="admin-header">
      <h2 class="admin-title">用户管理</h2>
      <el-button type="primary" @click="openDialog()">+ 新增用户</el-button>
    </div>

    <el-table :data="users" v-loading="loading" style="width: 100%;">
      <el-table-column prop="username" label="用户名" width="200" />
      <el-table-column label="角色" width="140">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small" round>
            {{ roleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="模块权限" min-width="200">
        <template #default="{ row }">
          <template v-if="row.role === 'operator'">
            <el-tag v-for="p in row.permissions" :key="p" size="small" class="perm-tag">
              {{ moduleLabel(p) }}
            </el-tag>
            <span v-if="!row.permissions || row.permissions.length === 0" style="color: #aeaeb2; font-size: 12px;">
              无权限
            </span>
          </template>
          <span v-else style="color: #86868b; font-size: 12px;">全部</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleDateString('zh-CN') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <template v-if="canManage(row)">
            <el-button text type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button text type="primary" size="small" @click="openResetPwd(row)">重置密码</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
          <el-button
            v-if="auth.isSuperAdmin && row.id !== auth.user?.id && row.role !== 'super_admin'"
            text type="warning" size="small"
            @click="openTransfer(row)"
          >
            移交主管理员
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑用户' : '新增用户'" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="!!editingId" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码" v-if="!editingId">
          <el-input v-model="form.password" type="password" placeholder="初始密码（至少6位）" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%;">
            <el-option v-if="auth.isSuperAdmin" label="管理员" value="admin" />
            <el-option label="运营" value="operator" />
          </el-select>
        </el-form-item>
        <el-form-item label="模块权限" v-if="form.role === 'operator'">
          <el-checkbox-group v-model="form.permissions">
            <el-checkbox label="gallery">产品图库</el-checkbox>
            <el-checkbox label="products">产品管理</el-checkbox>
            <el-checkbox label="series">系列管理</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog v-model="resetPwdVisible" title="重置密码" width="380px">
      <p style="margin-bottom: 12px;">重置 <strong>{{ resetUser?.username }}</strong> 的密码</p>
      <el-input v-model="newPassword" type="password" placeholder="输入新密码（至少6位）" show-password />
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" @click="handleResetPwd" :loading="resetting">确认重置</el-button>
      </template>
    </el-dialog>

    <!-- 移交主管理员对话框 -->
    <el-dialog v-model="transferVisible" title="移交主管理员" width="400px">
      <p style="margin-bottom: 12px;">
        确定将主管理员权限移交给 <strong>{{ transferTarget?.username }}</strong>？
      </p>
      <p style="margin-bottom: 12px; color: #e53e3e; font-size: 13px;">
        移交后您将变为管理员，此操作不可撤销。
      </p>
      <el-input v-model="transferPassword" type="password" placeholder="输入您的密码确认" show-password />
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="warning" @click="handleTransfer" :loading="transferring">确认移交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../../stores/auth';
import { getUsers, createUser, updateUser, resetPassword, deleteUser, transferSuperAdmin } from '../../api/users';

const auth = useAuthStore();

const users = ref([]);
const loading = ref(false);

const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ username: '', password: '', role: 'operator', permissions: [] });

const resetPwdVisible = ref(false);
const resetUser = ref(null);
const newPassword = ref('');
const resetting = ref(false);

const transferVisible = ref(false);
const transferTarget = ref(null);
const transferPassword = ref('');
const transferring = ref(false);

function roleLabel(role) {
  const map = { super_admin: '主管理员', admin: '管理员', operator: '运营' };
  return map[role] || role;
}

function roleTagType(role) {
  const map = { super_admin: 'danger', admin: '', operator: 'info' };
  return map[role] || 'info';
}

function moduleLabel(mod) {
  const map = { gallery: '产品图库', products: '产品管理', series: '系列管理' };
  return map[mod] || mod;
}

function canManage(row) {
  // 不能管理自己
  if (row.id === auth.user?.id) return false;
  // 不能管理 super_admin
  if (row.role === 'super_admin') return false;
  // admin 只能管理 operator
  if (auth.user?.role === 'admin' && row.role !== 'operator') return false;
  return true;
}

async function fetchUsers() {
  loading.value = true;
  try {
    users.value = await getUsers();
  } finally {
    loading.value = false;
  }
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = {
      username: row.username,
      password: '',
      role: row.role,
      permissions: row.permissions ? [...row.permissions] : [],
    };
  } else {
    editingId.value = null;
    form.value = { username: '', password: '', role: 'operator', permissions: [] };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateUser(editingId.value, { role: form.value.role, permissions: form.value.permissions });
      ElMessage.success('更新成功');
    } else {
      await createUser(form.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchUsers();
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除用户 ${row.username}？`, '确认删除', { type: 'warning' });
  await deleteUser(row.id);
  ElMessage.success('删除成功');
  fetchUsers();
}

function openResetPwd(row) {
  resetUser.value = row;
  newPassword.value = '';
  resetPwdVisible.value = true;
}

async function handleResetPwd() {
  if (!newPassword.value) return ElMessage.warning('请输入新密码');
  resetting.value = true;
  try {
    await resetPassword(resetUser.value.id, newPassword.value);
    ElMessage.success('密码重置成功');
    resetPwdVisible.value = false;
  } finally {
    resetting.value = false;
  }
}

function openTransfer(row) {
  transferTarget.value = row;
  transferPassword.value = '';
  transferVisible.value = true;
}

async function handleTransfer() {
  if (!transferPassword.value) return ElMessage.warning('请输入密码');
  transferring.value = true;
  try {
    await transferSuperAdmin(transferTarget.value.id, transferPassword.value);
    ElMessage.success('主管理员已移交，请重新登录');
    transferVisible.value = false;
    auth.logout();
    window.location.href = '/login';
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    transferring.value = false;
  }
}

onMounted(fetchUsers);
</script>

<style scoped>
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.admin-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.perm-tag {
  margin-right: 4px;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add client/src/views/admin/UserManageView.vue
git commit -m "feat: rewrite user management UI with three-tier roles and permissions"
```

---

### Task 11: 集成测试 + 部署

- [ ] **Step 1: 本地启动后端验证**

运行：`cd server && node src/app.js`

验证无启动错误。

- [ ] **Step 2: 本地启动前端验证**

运行：`cd client && npm run dev`

打开 http://localhost:5173，用 admin 账号登录，验证：
1. 登录成功，角色显示为"主管理员"
2. 导航菜单显示全部4个模块
3. 用户管理页面显示三列角色标签
4. 新增用户可以选择"管理员"和"运营"
5. 选择"运营"时出现模块权限勾选框
6. 移交主管理员按钮可见

- [ ] **Step 3: 构建前端**

运行：`cd client && npm run build`

- [ ] **Step 4: 推送代码到 GitHub**

```bash
git push origin main
```

- [ ] **Step 5: 在服务器上运行迁移**

在服务器上执行：
```bash
cd /var/www/atlantic-stars-gallery
git pull origin main
cd server
node src/scripts/migrate-roles.js
pm2 restart atlantic-server
```

- [ ] **Step 6: 重新构建前端**

在服务器上执行：
```bash
cd /var/www/atlantic-stars-gallery/client
npm run build
```

- [ ] **Step 7: 验证线上功能**

访问 http://atlanticstars.cc 验证全部功能正常。
