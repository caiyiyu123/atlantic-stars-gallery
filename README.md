# Atlantic Stars 产品图片库

内部产品图片管理系统。

## 本地开发

### 前置条件
- Node.js 20+
- MySQL 8.0
- 腾讯云 COS 账号

### 启动

1. 初始化数据库：`mysql -u root -p < database/init.sql`
2. 配置环境变量：复制 `server/.env.example` 为 `server/.env` 并填入实际值
3. 启动后端：`cd server && npm install && npm run dev`
4. 启动前端：`cd client && npm install && npm run dev`
5. 访问：http://localhost:5173

### 默认管理员
- 用户名：admin
- 密码：admin123（首次登录后请修改）

## 部署

1. 构建前端：`cd client && npm run build`
2. 上传项目到服务器 `/var/www/atlantic-stars-gallery/`
3. 安装依赖：`cd server && npm install --production`
4. 配置 Nginx：参考 `deploy/nginx.conf`
5. 启动 PM2：`pm2 start deploy/ecosystem.config.js`
