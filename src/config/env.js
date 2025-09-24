// config/env.js
require('dotenv').config();

const toNum = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toBool = (v, d = false) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string')
    return ['1','true','yes','on'].includes(v.trim().toLowerCase());
  return d;
};
const csv = (v) =>
  (typeof v === 'string' && v.trim().length)
    ? v.split(',').map(s => s.trim()).filter(Boolean)
    : [];

// ---- SERVER / CORS ----
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: toNum(process.env.PORT, 3000),
  HOST: process.env.HOST || '0.0.0.0',                 // дефолт для локалки/докера
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',          // можно CSV при желании

  // ---- DATABASE (mysql2/promise) ----
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: toNum(process.env.DB_PORT, 3306),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'usof_db',
  DB_CONN_LIMIT: toNum(process.env.DB_CONN_LIMIT, 10),
  DB_QUEUE_LIMIT: toNum(process.env.DB_QUEUE_LIMIT, 0),

  // обратная совместимость (если где-то уже читается старое имя)
  DB_POOL_MAX: toNum(process.env.DB_CONN_LIMIT, 10),

  // ---- SECURITY / AUTH (JWT / bcrypt) ----
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  TOKEN_ISSUER: process.env.TOKEN_ISSUER || 'usof-api',
  TOKEN_AUDIENCE: process.env.TOKEN_AUDIENCE || 'usof-client',
  PASSWORD_SALT_ROUNDS: toNum(process.env.PASSWORD_SALT_ROUNDS, 12),

  // ---- RATE LIMIT ----
  RATE_LIMIT_WINDOW_MS: toNum(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  RATE_LIMIT_MAX: toNum(process.env.RATE_LIMIT_MAX, 60),

  // ---- UPLOADS ----
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'src/uploads',
  MAX_UPLOAD_SIZE_MB: toNum(process.env.MAX_UPLOAD_SIZE_MB, 5),
  ALLOWED_IMAGE_TYPES: csv(process.env.ALLOWED_IMAGE_TYPES),

  // обратная совместимость (если в коде использовалось UPLOADS_DIR)
  UPLOADS_DIR: process.env.UPLOAD_DIR || 'src/uploads',

  // ---- MAIL ----
  MAIL_ENABLED: toBool(process.env.MAIL_ENABLED, false),
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: toNum(process.env.SMTP_PORT, 587),
  SMTP_SECURE: toBool(process.env.SMTP_SECURE, false),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'USOF <no-reply@example.com>',

  // обратная совместимость (если где-то читали FROM_EMAIL)
  FROM_EMAIL: process.env.MAIL_FROM || 'USOF <no-reply@example.com>',

  // ---- ADMIN PANEL ----
  ADMIN_PANEL_ENABLED: toBool(process.env.ADMIN_PANEL_ENABLED, true),
  ADMIN_PATH: process.env.ADMIN_PATH || '/admin',

  // ---- PAGINATION ----
  PAGINATION_LIMIT_DEFAULT: toNum(process.env.PAGINATION_LIMIT_DEFAULT, 10),
  PAGINATION_LIMIT_MAX: toNum(process.env.PAGINATION_LIMIT_MAX, 100),

  // ---- LOGGING ----
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // ---- INIT (dev/CI) ----
  INIT_DB: toBool(process.env.INIT_DB, false),
};

module.exports = env;
