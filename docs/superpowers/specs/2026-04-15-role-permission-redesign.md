# 角色权限系统重构设计

## 背景

当前系统只有 `admin` 和 `viewer` 两个角色，无法满足多层级权限管理需求。需要重构为三级角色体系，支持模块级权限控制。

## 角色定义

| 角色 | 数据库值 | 数量限制 | 说明 |
|------|---------|---------|------|
| 主管理员 | `super_admin` | 仅1位 | 最高权限，可移交给其他用户 |
| 管理员 | `admin` | 不限 | 用户管理权限，但只能管理运营账号 |
| 运营 | `operator` | 不限 | 按模块授权，无用户管理权限 |

## 权限矩阵

| 功能 | 主管理员 | 管理员 | 运营 |
|------|---------|--------|------|
| 产品图库（查看/下载） | 全部 | 全部 | 需授权 |
| 产品管理（增删改） | 全部 | 全部 | 需授权 |
| 系列管理（含季度管理） | 全部 | 全部 | 需授权 |
| 用户管理 - 查看用户列表 | 全部用户 | 仅运营 | 不可见 |
| 用户管理 - 添加用户 | 管理员+运营 | 仅运营 | 不可见 |
| 用户管理 - 编辑用户 | 管理员+运营 | 仅运营 | 不可见 |
| 用户管理 - 删除用户 | 管理员+运营 | 仅运营 | 不可见 |
| 用户管理 - 重置密码 | 管理员+运营 | 仅运营 | 不可见 |
| 移交主管理员 | 可以 | 不可以 | 不可以 |
| 修改自己密码 | 可以 | 可以 | 可以 |

## 运营模块权限

运营创建时，由主管理员或管理员勾选可访问的模块：

| 模块标识 | 模块名称 | 包含功能 |
|---------|---------|---------|
| `gallery` | 产品图库 | 查看产品列表、查看产品详情、下载图片 |
| `products` | 产品管理 | 产品的增删改、图片上传/删除/排序 |
| `series` | 系列管理 | 系列的增删改、季度的增删 |

## 数据库变更

### 1. 修改 users 表

```sql
ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'admin', 'operator') NOT NULL DEFAULT 'operator';
```

需要迁移现有数据：
- 现有 `admin` 用户中的初始管理员 → `super_admin`
- 其他 `admin` 用户 → `admin`（保持不变）
- 现有 `viewer` 用户 → `operator`

### 2. 新增 user_permissions 表

```sql
CREATE TABLE user_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module ENUM('gallery', 'products', 'series') NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_module (user_id, module)
);
```

## 后端 API 变更

### 中间件

1. **auth.js** — 不变，继续验证 JWT
2. **admin.js** — 重命名/重构为权限中间件，支持：
   - `requireRole(...roles)` — 检查用户角色是否在允许列表中
   - `requireModule(module)` — 检查运营用户是否有指定模块权限（主管理员和管理员默认通过）

### 路由权限调整

| 路由 | 当前中间件 | 新中间件 |
|------|----------|---------|
| GET /api/users | auth + admin | auth + requireRole('super_admin', 'admin') |
| POST /api/users | auth + admin | auth + requireRole('super_admin', 'admin') |
| PUT /api/users/:id | auth + admin | auth + requireRole('super_admin', 'admin') |
| DELETE /api/users/:id | auth + admin | auth + requireRole('super_admin', 'admin') |
| POST /api/users/:id/reset-password | auth + admin | auth + requireRole('super_admin', 'admin') |
| POST /api/products | auth + admin | auth + requireModule('products') |
| PUT /api/products/:id | auth + admin | auth + requireModule('products') |
| DELETE /api/products/:id | auth + admin | auth + requireModule('products') |
| GET /api/products | auth | auth + requireModule('gallery') |
| GET /api/products/:id | auth | auth + requireModule('gallery') |
| POST /api/images/upload | auth + admin | auth + requireModule('products') |
| PUT /api/images/sort | auth + admin | auth + requireModule('products') |
| DELETE /api/images/:id | auth + admin | auth + requireModule('products') |
| POST /api/images/download | auth | auth + requireModule('gallery') |
| POST /api/series | auth + admin | auth + requireModule('series') |
| PUT /api/series/:id | auth + admin | auth + requireModule('series') |
| DELETE /api/series/:id | auth + admin | auth + requireModule('series') |
| POST /api/seasons | auth + admin | auth + requireModule('series') |
| DELETE /api/seasons/:id | auth + admin | auth + requireModule('series') |
| GET /api/series | auth | auth（所有登录用户） |
| GET /api/seasons | auth | auth（所有登录用户） |

### 用户管理 API 业务逻辑

**GET /api/users**：
- 主管理员：返回所有用户
- 管理员：只返回 role=operator 的用户

**POST /api/users**：
- 主管理员：可创建 admin 和 operator
- 管理员：只能创建 operator
- 创建 operator 时，请求体包含 `permissions: ['gallery', 'products', 'series']`

**PUT /api/users/:id**：
- 主管理员：可修改 admin 和 operator
- 管理员：只能修改 operator
- 不能修改 super_admin

**DELETE /api/users/:id**：
- 不能删除 super_admin
- 不能删除自己
- 管理员只能删除 operator

### 新增 API：移交主管理员

**POST /api/users/transfer-super-admin**

```json
请求体: { "targetUserId": 5, "password": "当前密码" }
```

- 仅 super_admin 可调用
- 验证当前用户密码
- 事务操作：目标用户 → super_admin，当前用户 → admin
- 同时清除目标用户的 user_permissions 记录（如果之前是 operator）

## 前端变更

### Auth Store

- `user` 对象增加 `permissions` 字段：`['gallery', 'products', 'series']`
- 新增计算属性：
  - `isSuperAdmin` — role === 'super_admin'
  - `isAdmin` — role === 'admin' || role === 'super_admin'
  - `isOperator` — role === 'operator'
  - `hasModule(module)` — 主管理员/管理员返回 true，运营检查 permissions 数组

### 登录接口响应变更

```json
{
  "token": "...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "super_admin",
    "displayName": "admin",
    "permissions": ["gallery", "products", "series"]
  }
}
```

主管理员和管理员的 permissions 返回全部模块。

### 路由守卫

- `requiresAdmin: true` 改为 `requiredRole: ['super_admin', 'admin']`（用户管理页）
- 新增 `requiredModule: 'products'`（产品管理页）
- 新增 `requiredModule: 'series'`（系列管理页）
- 产品图库首页：`requiredModule: 'gallery'`
- 路由守卫检查用户角色和模块权限，无权限则重定向

### 导航菜单

- 主管理员/管理员：显示全部菜单（产品图库、产品管理、系列管理、用户管理）
- 运营：根据 permissions 动态显示菜单，不显示用户管理

### 用户管理页面

- 角色选择：主管理员看到 admin/operator 选项，管理员只看到 operator
- 创建/编辑运营时，显示模块权限勾选框（gallery、products、series）
- 创建/编辑管理员时，不显示模块权限勾选框
- 新增"移交主管理员"按钮，仅主管理员可见
- 移交时弹窗确认，需输入密码
- 角色标签颜色区分：super_admin 红色、admin 橙色、operator 灰色

## 数据迁移

1. 修改 users 表 role 枚举
2. 将 id=1 的初始 admin 用户更新为 super_admin
3. 将所有 viewer 用户更新为 operator
4. 为所有 operator 用户插入全部模块权限（gallery, products, series）
5. 创建 user_permissions 表
