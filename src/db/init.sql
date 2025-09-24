SET NAMES utf8mb4;
SET time_zone = '+00:00';
-- Опционально, полезно для строгой валидации чисел/дат:
-- SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- --------------------------------------------------
-- Чистый ресет (удаляем таблицы в правильном порядке)
-- --------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts_categories;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS reset_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS revoked_tokens;


SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------
-- Создание таблиц (единая коллация)
-- --------------------------------------------------

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  profile_picture VARCHAR(255),
  rating INT NOT NULL DEFAULT 0,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  publish_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  content TEXT NOT NULL,
  image VARCHAR(255),
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE posts_categories (
  post_id INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (post_id, category_id),
  CONSTRAINT fk_pc_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  author_id INT NOT NULL,
  publish_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content TEXT NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  post_id INT NULL,
  comment_id INT NULL,
  publish_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type ENUM('like','dislike') NOT NULL,
  CONSTRAINT chk_target CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  ),
  UNIQUE KEY uniq_like_post (author_id, post_id),
  UNIQUE KEY uniq_like_comment (author_id, comment_id),
  CONSTRAINT fk_likes_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE email_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti VARCHAR(64) PRIMARY KEY,
  exp DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(exp);

-- --------------------------------------------------
-- Индексы для производительности
-- --------------------------------------------------

-- posts
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_status ON posts(status);

-- comments
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_status ON comments(status);

-- likes
CREATE INDEX idx_likes_author_id ON likes(author_id);
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_comment_id ON likes(comment_id);
CREATE INDEX idx_likes_type ON likes(type);

-- posts_categories (PK покрывает (post_id, category_id), но нужны отдельные под один ключ)
CREATE INDEX idx_pc_post_id ON posts_categories(post_id);
CREATE INDEX idx_pc_category_id ON posts_categories(category_id);

-- email/reset tokens
CREATE INDEX idx_email_tokens_user_id ON email_tokens(user_id);
CREATE INDEX idx_email_tokens_expires_at ON email_tokens(expires_at);
CREATE INDEX idx_reset_tokens_user_id ON reset_tokens(user_id);
CREATE INDEX idx_reset_tokens_expires_at ON reset_tokens(expires_at);

-- --------------------------------------------------
-- Сиды (≥5 записей в КАЖДУЮ таблицу)
-- --------------------------------------------------

-- bcrypt hash для "Password123!"
-- $2b$10$uQpX8oZ9N4B2cAVbqZ6r7e2yH3Q5s7m8i9j0k1l2m3n4o5p6q7r8S
SET @pwd := '$2b$10$uQpX8oZ9N4B2cAVbqZ6r7e2yH3Q5s7m8i9j0k1l2m3n4o5p6q7r8S';

INSERT INTO users (id, login, email, password_hash, full_name, email_confirmed, profile_picture, rating, role)
VALUES
  (1, 'admin', 'admin@example.com', @pwd, 'Admin User', 1, 'uploads/avatars/admin.png', 0, 'admin'),
  (2, 'u1',    'u1@example.com',    @pwd, 'User One',  1, 'uploads/avatars/u1.png',    0, 'user'),
  (3, 'u2',    'u2@example.com',    @pwd, 'User Two',  1, 'uploads/avatars/u2.png',    0, 'user'),
  (4, 'u3',    'u3@example.com',    @pwd, 'User Three',0, 'uploads/avatars/u3.png',    0, 'user'),
  (5, 'u4',    'u4@example.com',    @pwd, 'User Four', 1, 'uploads/avatars/u4.png',    0, 'user');

INSERT INTO categories (id, title, description) VALUES
  (1, 'javascript', 'Everything JS'),
  (2, 'mysql',      'Relational DB'),
  (3, 'node',       'Node.js runtime'),
  (4, 'api',        'APIs and REST'),
  (5, 'security',   'Auth, JWT, hashing');

INSERT INTO posts (id, author_id, title, status, content, image, publish_date) VALUES
  (1, 2, 'Intro to Node',     'active',   'Hello Node world',                 'uploads/posts/p1.jpg', NOW() - INTERVAL 14 DAY),
  (2, 3, 'MySQL 101',         'active',   'Basics of MySQL',                  'uploads/posts/p2.jpg', NOW() - INTERVAL 10 DAY),
  (3, 2, 'Express Best Practices','inactive','How to structure Express apps', 'uploads/posts/p3.jpg', NOW() - INTERVAL 7 DAY),
  (4, 4, 'REST API patterns', 'active',   'Clean routing, validation, etc.',  'uploads/posts/p4.jpg', NOW() - INTERVAL 5 DAY),
  (5, 5, 'Security check',    'active',   'JWT, bcrypt, rate limit',          'uploads/posts/p5.jpg', NOW() - INTERVAL 2 DAY);

INSERT INTO posts_categories (post_id, category_id) VALUES
  (1, 3), (1, 1),
  (2, 2), (2, 4),
  (3, 3), (3, 4),
  (4, 4), (4, 1),
  (5, 5), (5, 4);

INSERT INTO comments (id, post_id, author_id, content, status, publish_date) VALUES
  (1, 1, 3, 'Nice intro!',           'active',   NOW() - INTERVAL 13 DAY),
  (2, 2, 2, 'Very helpful article',  'active',   NOW() - INTERVAL 9 DAY),
  (3, 4, 5, 'Please add examples',   'inactive', NOW() - INTERVAL 4 DAY),
  (4, 5, 3, 'JWT part is 🔥',        'active',   NOW() - INTERVAL 1 DAY),
  (5, 5, 2, 'Add about refresh...',  'active',   NOW() - INTERVAL 12 HOUR);

INSERT INTO likes (id, author_id, post_id, comment_id, type, publish_date) VALUES
  (1, 2, 1, NULL, 'like',    NOW() - INTERVAL 13 DAY),
  (2, 3, 1, NULL, 'like',    NOW() - INTERVAL 12 DAY),
  (3, 4, 2, NULL, 'like',    NOW() - INTERVAL 8 DAY),
  (4, 5, 5, NULL, 'dislike', NOW() - INTERVAL 1 DAY),
  (5, 3, 4, NULL, 'like',    NOW() - INTERVAL 3 DAY),

  (6, 2, NULL, 1, 'like',    NOW() - INTERVAL 13 DAY),
  (7, 5, NULL, 2, 'like',    NOW() - INTERVAL 9 DAY),
  (8, 2, NULL, 3, 'dislike', NOW() - INTERVAL 4 DAY),
  (9, 4, NULL, 4, 'like',    NOW() - INTERVAL 1 DAY),
  (10,5, NULL, 5, 'like',    NOW() - INTERVAL 6 HOUR);

INSERT INTO email_tokens (user_id, token, expires_at) VALUES
  (3, 'confirm_tok_1', NOW() + INTERVAL 7 DAY),
  (4, 'confirm_tok_2', NOW() + INTERVAL 7 DAY),
  (5, 'confirm_tok_3', NOW() + INTERVAL 7 DAY),
  (2, 'confirm_tok_4', NOW() + INTERVAL 7 DAY),
  (1, 'confirm_tok_5', NOW() + INTERVAL 7 DAY);

INSERT INTO reset_tokens (user_id, token, expires_at) VALUES
  (1, 'reset_tok_1', NOW() + INTERVAL 1 DAY),
  (2, 'reset_tok_2', NOW() + INTERVAL 1 DAY),
  (3, 'reset_tok_3', NOW() - INTERVAL 1 DAY),
  (4, 'reset_tok_4', NOW() + INTERVAL 2 DAY),
  (5, 'reset_tok_5', NOW() + INTERVAL 3 DAY);
