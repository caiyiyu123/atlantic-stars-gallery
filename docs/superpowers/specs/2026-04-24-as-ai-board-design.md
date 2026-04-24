# AS-AI 板块设计文档

- **日期**：2026-04-24
- **作者**：caiyiyu（需求）+ Claude（设计）
- **状态**：草案待审阅
- **相关代码库**：`atlantic-stars-gallery`（Node.js + Express 后端，Vue 3 + Element Plus 前端）

---

## 1. 背景与目标

在现有的 Atlantic Stars Workspace（AS 产品库）之外，新增一个并列的独立板块 **AS-AI**。AS-AI 面向的是 AI 辅助工作流，首期只实现 **「高清白底图」** 一个功能（把产品图通过 AI 处理成电商平台风格的白底高清图）。

两个板块通过登录后的"选择页"和顶部导航栏的"切换按钮"互通，权限上独立控制。

---

## 2. 术语

- **AS 产品库**：现有的产品图片库 + 用户/权限/API Key 管理等，路由挂在 `/`、`/admin/*`
- **AS-AI**：新板块，路由挂在 `/ai/*`
- **批次（batch）**：用户一次点击"开始处理"产生的一组生图任务的集合
- **任务（job）**：一张输入图 × 一个模型的一次生成，是批次的最小颗粒

---

## 3. 整体架构 & 导航流

### 3.1 路由结构

```
/login                             登录页
/choose                            [新] 登录后的选择页（两张大卡片）

AS 产品库板块（现有）
/                                  产品图库
/product/:id                       产品详情
/admin/products                    产品管理
/admin/series                      系列管理
/admin/users                       用户管理
/admin/api-keys                    API Key 管理

AS-AI 板块（新增）
/ai/hd-white                       高清白底图（唯一实现的功能）
/ai/feature-2                      功能二（灰置占位）
/ai/feature-3                      功能三（灰置占位）
```

### 3.2 用户流

```
登录成功
   ↓
选择页 /choose
   ├─→ 点 "AS 产品库" 卡片  → /（产品图库默认页）
   └─→ 点 "AS-AI" 卡片      → /ai/hd-white

在任一板块，点右上角"切换到 XXX"按钮 → 跳到另一板块。
单板块权限的用户，切换按钮隐藏。
```

### 3.3 权限模型

在现有三级角色 + 模块权限体系上扩展：

| 角色 | gallery | products | series | as_ai |
|------|---------|----------|--------|-------|
| super_admin | ✓ | ✓ | ✓ | ✓ |
| admin       | ✓ | ✓ | ✓ | ✓ |
| operator    | 按配置 | 按配置 | 按配置 | 按配置 |

- `user_permissions.module` 字段新增合法值 `as_ai`
- 登录接口返回的 `permissions` 数组将包含 `as_ai`
- 路由守卫通过 `meta.requiredModule: 'as_ai'` 控制访问
- 用户管理页面的"模块权限"多选框增加 `AS-AI` 选项

---

## 4. UI 设计

### 4.1 选择页 `/choose`

- 登录成功后默认跳转至此
- 页面中央横向排列两张大卡片："AS 产品库" 与 "AS-AI"
- 无权限的卡片：`opacity: 0.4` + 按钮禁用 + 底部小字 "暂无权限"
- 有权限的卡片：正常显示，点击 → 进入对应板块的默认页
- 视觉色调延续品牌色（CF2028/EE7624/F5D726）

### 4.2 导航栏（两个板块共用 `AppNav.vue`）

左侧：Logo + 三个黄橙红按钮（按当前板块切换内容）
右侧：两行布局 —— 上行"切换到 XXX"按钮，下行"用户名 + 头像"

**AS 产品库下**（路由不以 `/ai` 开头）：

```
[LOGO] [产品图库🟡] [产品管理🟠] [系列管理🔴]    [切换到 AS-AI]
                                                 [用户名] [头像●]
```

**AS-AI 下**（路由以 `/ai` 开头）：

```
[LOGO] [高清白底图🟡] [功能二🟠(灰)] [功能三🔴(灰)]  [切换到 AS 产品库]
                                                       [用户名] [头像●]
```

**切换按钮行为：**
- 另一边板块用户无权限时，按钮隐藏（不渲染）
- 和用户名+头像在同一右侧区域的上方
- 样式小一些（高度 ~28px），灰底或边框，避免与主导航色冲突

**功能二/功能三的灰置：**
- `pointer-events: none`，`opacity: 0.5`
- 鼠标悬停显示 tooltip "敬请期待"

### 4.3 高清白底图页 `/ai/hd-white`

顶部 tab：`[处理图片] [历史记录] [Prompt 模板]`（第三个 tab 仅 super_admin 可见）

#### Tab 1 — 处理图片

- 上传区（拖拽或点击）：JPG/PNG/WEBP，单张 ≤ 20MB，**单次批量最多 10 张**
- 已选图缩略图列表，可单个移除
- 模型配置区：
  - 第一行固定是默认行 —— 名称为 `Nano Banana 2` 的 API Key（通过"名称"字段精确匹配）
  - "+ 添加模型"按钮弹出下拉，展示所有 `is_active = 1` 的 API Key（按"名称"显示）
  - 每行右侧有数量输入框（1–10，默认 1），追加行有"×"删除按钮
  - 已添加的 Key 从下拉中过滤，防止重复
  - 若数据库中不存在名称为 `Nano Banana 2` 的 Key，页面顶部提示 "请先在 API Key 管理中添加名称为 'Nano Banana 2' 的 Key"，禁用"开始处理"按钮
- 点击"开始处理"：
  - 前端 `multipart/form-data` 发送到 `POST /api/ai-jobs`（带所有原图 + 模型配置）
  - 后端立即返回 batch_id 和 jobs 列表（status=pending）
  - 前端进入轮询 `GET /api/ai-jobs/batch/:batchId`（每 2 秒）
  - 下方显示进度条 `N/M 处理中...` 和结果网格
  - 单张失败不影响其他；失败卡片显示错误 + "重试"按钮

#### Tab 2 — 历史记录

- 瀑布流/网格视图，每个卡片 = 一张结果图
- 卡片内容：结果图缩略图、模型名、生成时间、[下载] 按钮
- 顶部筛选：模型名、状态（成功/失败）、时间范围
- 点击卡片 → 弹窗大图预览，显示"原图 vs 结果图"对比
- 权限：
  - 普通用户只能看自己的记录（后端强制 `user_id = req.user.id`）
  - super_admin 额外有"查看用户"筛选器（`GET /api/ai-jobs/users` 返回用户列表），可切换看任意用户

#### Tab 3 — Prompt 模板（仅 super_admin）

- 标准列表 + CRUD：名称、Prompt 内容（预览前 80 字）、默认标记、操作按钮
- "+ 新增模板" 弹窗：名称 + 大文本框（prompt 内容）
- 每条记录有 "设为默认"、"编辑"、"删除" 三个操作
- 同时只允许一条 `is_default=1`；把一条设为默认时，后端事务里把其他的默认标记清零
- 默认模板不能删除（需先把另一条设为默认）
- 生图时后端自动取 `is_default=1` 的那条作为 prompt

---

## 5. 数据模型

### 5.1 现有表微调

**`api_keys`** —— 字段重命名 `label` → `name`：

```sql
ALTER TABLE api_keys CHANGE label name VARCHAR(100) DEFAULT '';
```

前端同步把"备注"改为"名称"。"名称"从"随便起的描述"变成"业务标识"（会被 AS-AI 按字符串精确匹配，如 `Nano Banana 2`）。

**`user_permissions.module`** —— 允许新值 `as_ai`：

无需改表结构（字段本就是 VARCHAR），只需在代码中把 `VALID_MODULES` 数组扩展：
`['gallery', 'products', 'series']` → `['gallery', 'products', 'series', 'as_ai']`

**auth 登录接口返回的 `permissions` 默认值** —— super_admin/admin 自动给全部：
- 现有逻辑中 super_admin/admin 返回 `['gallery', 'products', 'series']`，调整为 `['gallery', 'products', 'series', 'as_ai']`

### 5.2 新增表

**`prompt_templates`**：

```sql
CREATE TABLE prompt_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_is_default (is_default)
);
```

迁移脚本植入一条内置的"白底主图"默认模板（英文 prompt，效果更稳定）。

**`ai_image_jobs`**（每条 = 一张输入图 × 一个模型的一次生成）：

```sql
CREATE TABLE ai_image_jobs (
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
);
```

字段说明：
- `batch_id`：一次"开始处理"的批次号（UUID / 短随机串），前端界面不显示给用户，只用于轮询接口
- `prompt_snapshot`：生成时的完整 prompt 字符串冗余存储，模板后续被编辑也能追溯历史任务用的原始 prompt
- `model_name`：冗余 `api_keys.model_name`，即使该 Key 被删除历史记录仍可读
- `prompt_template_id` / `api_key_id`：**不加外键**，删除模板/Key 时历史记录保留（id 变悬挂，但 snapshot 和 model_name 仍可读）
- `status` 流转：`pending` → `processing` → `success` / `failed`
- `duration_ms`：从调用 AI 开始到拿到结果的耗时

### 5.3 文件存储

- 原图：`server/uploads/ai/{user_id}/original/{yyyymm}/{filename}`
- 结果图：`server/uploads/ai/{user_id}/result/{yyyymm}/{filename}`
- URL 通过 `/uploads/...` 访问（复用现有 `express.static` 路由）
- 与现有产品图存储结构保持一致

---

## 6. 后端接口清单

### 6.1 API Key 管理（现有，字段改名）

已存在路由，仅把 `label` 字段重命名为 `name`；不再列出。

### 6.2 Prompt 模板（新增）

全部接口要求 `auth` + `requireRole('super_admin')`：

| Method | Path | 用途 |
|--------|------|------|
| GET    | `/api/prompt-templates`            | 列表 |
| POST   | `/api/prompt-templates`            | 新增 |
| PUT    | `/api/prompt-templates/:id`        | 编辑 |
| DELETE | `/api/prompt-templates/:id`        | 删除（默认模板不可删） |
| POST   | `/api/prompt-templates/:id/set-default` | 设为默认（事务） |

### 6.3 AI 生图任务（新增）

全部接口要求 `auth` + `requireModule('as_ai')`：

| Method | Path | 用途 |
|--------|------|------|
| POST   | `/api/ai-jobs`                     | 提交任务（multipart，图+配置） |
| GET    | `/api/ai-jobs/batch/:batchId`      | 查询一个批次的状态（前端轮询） |
| GET    | `/api/ai-jobs/history`             | 历史记录分页（筛选：model, status, date_range, user_id） |
| POST   | `/api/ai-jobs/:id/retry`           | 单任务重试 |
| GET    | `/api/ai-jobs/users`               | 用户列表（仅 super_admin 可访问，用于筛选器） |

**权限细节**：
- `/history`：普通用户后端强制 `user_id = req.user.id` 忽略请求里的 user_id；super_admin 可传 user_id 查任意用户
- `/users`：非 super_admin 返回 403
- `/retry`：只能重试自己的任务；super_admin 可重试任意

### 6.4 POST `/api/ai-jobs` 详细行为

请求：`multipart/form-data`
- `files[]`：≥1 张，≤10 张
- `models[]`：JSON 数组，例如 `[{"api_key_id": 1, "count": 1}, {"api_key_id": 3, "count": 2}]`

后端校验：
1. `auth.user` 有 `as_ai` 权限
2. `files.length` 介于 1–10
3. 所有 `api_key_id` 存在且 `is_active = 1`
4. 每个 `count` 介于 1–10
5. `api_key_id` 不能重复
6. **总任务数 = Σ(files.length × model.count) ≤ 50**（硬上限，超出拒绝）
7. 数据库中存在 `is_default=1` 的 prompt_template，否则 500 并提示 super_admin 先建一条模板

响应：
```json
{
  "batch_id": "xxxxxxxx",
  "jobs": [{"id": 1, "status": "pending", "model_name": "...", "original_image_path": "..."}, ...]
}
```

后台（立即返回后异步执行）：
1. 生成 batch_id（UUID / 短随机）
2. 保存所有原图到 `uploads/ai/{user_id}/original/{yyyymm}/*`
3. 取 is_default=1 的模板，记录 prompt 快照
4. 为每个 `(图, 模型, 第N次)` 组合创建一条 `ai_image_jobs` 记录（status=pending）
5. 把这些 job 推入内存队列（服务层 `aiJobQueue`），queue worker 并发 3 个消费

---

## 7. AI 调用与任务队列

### 7.1 aiService.js 扩展

在现有 `callAI()`（纯文本）之外，新增：

```js
async function callGeminiImage(modelName, apiKey, prompt, originalImageBase64) {
  // POST /gemini/v1beta/models/{model}:generateContent
  // body: { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type, data } }] }] }
  // 从 response.candidates[0].content.parts[?].inline_data.data 提取返回图片 base64
}
```

**注意**：图像模型的路径和文本模型都是 `:generateContent`，但 body 里要带 `inline_data` 部分；响应体的 parts 里会有一个 `inline_data` 元素是生成的图片 base64。

### 7.2 轻量任务队列

**不引入外部队列**（Redis / BullMQ）。用内存队列：

```js
// services/aiJobQueue.js
const queue = [];
let running = 0;
const MAX_CONCURRENT = 3;

function enqueue(job) { queue.push(job); tick(); }

function tick() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    running++;
    processJob(job).finally(() => { running--; tick(); });
  }
}
```

**已知局限**：
- PM2 重启会丢失未完成的内存任务（会被留在数据库中 status=pending 或 processing）
- 暂不做"重启后自动扫库重拾任务"（以后有需要再加）
- 不做多进程/多实例支持（AS 网站目前就单实例 PM2）

### 7.3 单任务处理器 `aiImageProcessor.js`

```
function processJob(jobId):
  1. 置 status=processing, started_at=now
  2. 查 api_keys 取 api_key, model_name
  3. 读 original_image_path → base64
  4. 根据 provider 调 callGeminiImage(...)（目前仅支持 gemini 系列）
  5. 结果 base64 → 保存到 uploads/ai/{user_id}/result/{yyyymm}/xxx.png
  6. 置 status=success, result_image_path, duration_ms, finished_at
  7. api_keys.call_count++, last_used_at=now
  抓异常：置 status=failed, error_message（截断 500 字符）
```

---

## 8. 文件结构（新增/改动）

### 8.1 后端

```
server/src/
├── scripts/
│   ├── migrate-api-keys-rename.js       [新]  ALTER label→name
│   ├── migrate-prompt-templates.js      [新]  建表 + 植入默认模板
│   └── migrate-ai-image-jobs.js         [新]  建表
├── services/
│   ├── aiService.js                     [改]  增加 callGeminiImage()
│   ├── aiJobQueue.js                    [新]  内存队列（并发 3）
│   └── aiImageProcessor.js              [新]  单任务处理器
├── routes/
│   ├── auth.js                          [改]  登录返回的 permissions 数组加 as_ai
│   ├── apiKeys.js                       [改]  字段 label→name 同步
│   ├── users.js                         [改]  VALID_MODULES 加 as_ai
│   ├── promptTemplates.js               [新]  CRUD + set-default
│   └── aiJobs.js                        [新]  提交、查询、重试、用户列表
└── app.js                               [改]  注册 /api/prompt-templates, /api/ai-jobs
```

### 8.2 前端

```
client/src/
├── api/
│   ├── apiKeys.js                       [无改]
│   ├── promptTemplates.js               [新]
│   └── aiJobs.js                        [新]
├── components/
│   └── AppNav.vue                       [改]  按路由切换按钮组 + 右侧两行
├── router/
│   └── index.js                         [改]  新增 /choose 和 /ai/*
├── stores/
│   └── auth.js                          [无改]  hasModule('as_ai') 已自动支持
└── views/
    ├── ChooseView.vue                   [新]  登录后的选择页
    ├── admin/
    │   ├── ApiKeyManageView.vue         [改]  "备注" → "名称"
    │   └── UserManageView.vue           [改]  模块权限多选框加 "AS-AI"
    └── ai/                              [新]
        ├── HdWhiteView.vue              [新]  高清白底图主页（含 3 tab）
        ├── components/
        │   ├── ProcessTab.vue           [新]
        │   ├── HistoryTab.vue           [新]
        │   └── PromptTemplateTab.vue    [新]
        └── FeaturePlaceholderView.vue   [新]  功能二/三占位页
```

---

## 9. 实现阶段（给 writing-plans 参考）

- **阶段 A — 后端基础设施**：迁移脚本 + aiService 扩展 + Prompt 模板 CRUD + 任务队列 + 生图接口 + 权限枚举扩展 + 路由注册
- **阶段 B — 前端导航框架**：路由守卫扩展 + AppNav 改造 + ChooseView + 用户管理模块权限 checkbox 加 AS-AI
- **阶段 C — API Key 管理微调**：前端"备注" → "名称"
- **阶段 D — AS-AI 核心功能**：HdWhiteView 三 tab + 占位页
- **阶段 E — 联调 + 本地测试 + 部署**：本地跑通 → 提交 → 服务器迁移 + 部署

---

## 10. 边界 & 不做的事

**明确不做：**
- Redis/BullMQ 重型队列（PM2 单实例+内存队列够用）
- 历史记录的过期清理（以后数据量大了再加定时任务）
- OpenAI/Claude 的图像生成（目前仅支持 Gemini 系列图像模型）
- 用户自定义 prompt（只能从模板选，默认模板生效，用户界面不显示当前用的模板）
- 生图成本统计
- 生图的水印、尺寸选项、风格预设（保持 MVP 最小闭环）
- 重启后自动扫库重拾未完成任务（内存队列局限，以后有需要再加）
- COS 对象存储（本地存储已够用）

**保留的口子**（便于以后扩展）：
- Prompt 模板支持多条，以后可做"模板选择下拉"
- `ai_image_jobs.prompt_snapshot` 保留完整 prompt 快照，便于追溯
- `aiService.callGeminiImage()` 独立方法，以后加 OpenAI/Claude 图像生成只需扩展
- 功能二/三的路由位置已预留

---

## 11. 测试关键点（给后续 plan 参考）

- 选择页：两边权限组合的显示/禁用正确
- 导航栏：在 /ai/* 和非 /ai/* 下按钮组正确切换；无权限时切换按钮隐藏
- 路由守卫：无 as_ai 权限的用户访问 /ai/* 被重定向
- 模板设默认：同时只有一条 is_default=1（事务并发）
- 生图：单张、多张、多模型、每模型多张的组合都能完成
- 总任务数超 50 的提交被拒绝
- 失败重试：重试成功后 status 变 success，重试失败仍是 failed
- 历史权限：普通用户拿不到别人的记录；super_admin 能看任意
- API Key 名称找不到 `Nano Banana 2` 时前端正确提示
