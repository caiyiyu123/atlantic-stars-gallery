CREATE DATABASE IF NOT EXISTS atlantic_stars
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE atlantic_stars;

-- 用户表
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'viewer') NOT NULL DEFAULT 'viewer',
  display_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 季度表
CREATE TABLE seasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year SMALLINT NOT NULL,
  season ENUM('SS', 'FW') NOT NULL,
  name VARCHAR(20) NOT NULL,
  UNIQUE KEY uk_year_season (year, season)
) ENGINE=InnoDB;

-- 系列表
CREATE TABLE series (
  id INT AUTO_INCREMENT PRIMARY KEY,
  season_id INT NOT NULL,
  category ENUM('men', 'women', 'kids') NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 产品表
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  series_id INT NOT NULL,
  sku VARCHAR(50) NOT NULL UNIQUE,
  color_name VARCHAR(100) NOT NULL,
  material VARCHAR(200),
  size_range VARCHAR(50),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 图片表
CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  cos_key VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  original_url VARCHAR(500) NOT NULL,
  file_size INT UNSIGNED DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  uploaded_by INT,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 初始管理员账号（密码: admin123，bcrypt hash）
INSERT INTO users (username, password_hash, role, display_name)
VALUES ('admin', '$2b$10$iIM1DBt5X/dPJjYRPYGtP.w5PH9exDsq35JC03ZRGy.JInXeQ2Ez6', 'admin', 'Administrator');
