// src/app.js
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const rateLimit = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');

// роуты
const { mountAdminPanel } = require('./admin/admin'); // ✅ правильный путь
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const likeRoutes = require('./routes/likeRoutes');

const app = express();

// доверяем прокси/CDN, чтобы rateLimit видел реальный IP
app.set('trust proxy', 1);

// ───────────── CORS ─────────────
// поддержка списка доменов через запятую или '*'
const origins = (env.CORS_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: origins.length === 1 && origins[0] === '*' ? true : origins,
  credentials: true,
}));

// парсеры
app.use(express.json({ limit: `${env.MAX_UPLOAD_SIZE_MB}mb` }));
app.use(express.urlencoded({ extended: true }));

// статика для загруженных файлов (аватары/картинки постов)
const uploadsDir = path.resolve(env.UPLOAD_DIR || 'src/uploads');
app.use('/uploads', express.static(uploadsDir));

// глобальный rate limit (для /auth можно навесить отдельный жёстче в роутере)
app.use(rateLimit);

// ====== ROUTES ======
const API_PREFIX = '/api'; // ⬅️ общий префикс как в PDF

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/posts`, postRoutes);
app.use(`${API_PREFIX}/comments`, commentRoutes);
app.use(`${API_PREFIX}/categories`, categoryRoutes);
app.use(API_PREFIX, likeRoutes); // /api/posts/:id/like и /api/comments/:id/like

// ====== ADMIN PANEL ======
mountAdminPanel(app); // ✅ монтируем до 404 и errorHandler

// Swagger /docs по флагу
const DOCS_ENABLED = String(env.DOCS_ENABLED || process.env.SWAGGER_ENABLED || '').toLowerCase() === 'true';
if (DOCS_ENABLED) {
  try {
    const swaggerUi = require('swagger-ui-express');
    const yaml = require('yamljs');
    const spec = yaml.load(path.resolve('openapi.yaml'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  } catch (e) {
    console.warn('[docs] Swagger UI is enabled but not installed or spec missing:', e.message);
  }
}

// 404 для несуществующих ручек
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// единый обработчик ошибок — в самом конце
app.use(errorHandler);

module.exports = app;
