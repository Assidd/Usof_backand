// src/utils/jwt.js
'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET   = process.env.JWT_SECRET || 'dev_secret';

// Совместимость по именам переменных окружения
const ISSUER   = process.env.JWT_ISSUER   || process.env.TOKEN_ISSUER   || 'usof-api';
const AUDIENCE = process.env.JWT_AUDIENCE || process.env.TOKEN_AUDIENCE || 'usof-client';

// Дефолт для TTL access-токена, если не передан в opts.expiresIn
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Генерим jti для ревокации
function newJti() {
  return (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
}

/**
 * Подпись JWT.
 * Принимает payload и opts:
 *   - opts.expiresIn (например, '15m' или число секунд)
 *   - opts.jti ИЛИ opts.jwtid (оба допустимы; будет использовано как jwtid)
 *
 * Важно: jsonwebtoken ожидает 'jwtid' в options — поэтому маппим jti → jwtid
 * и НЕ пробрасываем исходный opts целиком (чтобы не унести лишние поля).
 */
function signJwt(payload = {}, opts = {}) {
  // поддерживаем и opts.jti, и opts.jwtid
  const jwtid = opts.jwtid || opts.jti || newJti();
  const expiresIn = opts.expiresIn || EXPIRES_IN;

  const signOptions = {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn,
    jwtid, // ключевой параметр для последующей ревокации по jti
  };

  return jwt.sign(payload, SECRET, signOptions);
}

/**
 * Верификация JWT (возвращает payload)
 * Проверяем issuer/audience, если заданы
 */
function verifyJwt(token) {
  const verifyOptions = {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  };
  return jwt.verify(token, SECRET, verifyOptions);
}

/**
 * Вытащить Bearer-токен из заголовка Authorization
 */
function extractBearer(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

module.exports = {
  signJwt,
  verifyJwt,
  extractBearer,
  newJti,
  // алиасы под старые импорты
  signAccessToken: signJwt,
  verifyAccessToken: verifyJwt,
};
