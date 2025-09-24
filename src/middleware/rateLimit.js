// src/middleware/rateLimit.js
'use strict';

const rateLimit = require('express-rate-limit');
// В v7+ helper доступен как именованный экспорт
const { ipKeyGenerator } = require('express-rate-limit');

// Фабрика лимитеров с единым keyGenerator/handler
function createLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Безопасный ключ: корректно обрабатывает IPv4/IPv6 + сегментация по маршруту
    keyGenerator: (req /*, res*/) => `${ipKeyGenerator(req)}:${req.originalUrl || req.path}`,
    // Явный JSON-ответ — стабильно в тестах и проде
    handler: (_req, res /*, next, options*/) => {
      res.status(429).json({ error: 'TooManyRequests', message: 'Rate limit exceeded' });
    },
  });
}

// Глобальные значения (по умолчанию мягче)
const GLOBAL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000); // 1 мин
const GLOBAL_MAX       = Number(process.env.RATE_LIMIT_MAX ?? 60);

// Для /auth — жёстче по дефолту (можно переопределить в .env)
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000); // 15 мин
const AUTH_MAX       = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 50);

const globalLimiter = createLimiter({ windowMs: GLOBAL_WINDOW_MS, max: GLOBAL_MAX });
const authLimiter   = createLimiter({ windowMs: AUTH_WINDOW_MS,   max: AUTH_MAX });

// Экспорт: по умолчанию — глобальный; доп.экспорт — authLimiter и фабрика
module.exports = globalLimiter;
module.exports.authLimiter = authLimiter;
module.exports.createLimiter = createLimiter;
