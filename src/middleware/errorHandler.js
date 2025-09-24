// src/middleware/errorHandler.js
'use strict';

/**
 * Централизованный обработчик ошибок.
 * - Возвращаем JSON единого формата.
 * - Маппим частые MySQL-коды в корректные HTTP-статусы.
 * - Поддерживаем ошибки валидации (express-validator / кастомные).
 * - Без лишних подробностей в production.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Приводим ошибку к { status, message, code?, details? }.
 */
function normalizeError(err) {
  // 1) Если разработчик заранее задал статус — уважаем
  if (err && err.status) {
    return {
      status: err.status,
      message: err.message || 'Error',
      code: err.code,
      details: err.details,
    };
  }

  // 2) Ошибки валидации от express-validator (если ты будешь использовать собственный validate middleware)
  // Ожидаем, что валидатор кидал { status: 400, details: [...] } или сам err.array?.()
  if (typeof err?.array === 'function') {
    return {
      status: 400,
      message: 'Validation error',
      details: err.array(),
    };
  }
  if (err?.name === 'ValidationError') {
    return {
      status: 400,
      message: err.message || 'Validation error',
      details: err.details || undefined,
    };
  }

  // 3) Частые MySQL ошибки
  //   - ER_DUP_ENTRY (1062): нарушение уникального индекса → 409 Conflict
  //   - ER_NO_REFERENCED_ROW_2 (1452): внешний ключ не найден → 400 Bad Request
  //   - ER_ROW_IS_REFERENCED_2 (1451): запись используется как FK → 409 Conflict
  if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
    return {
      status: 409,
      message: 'Duplicate entry',
      code: err.code,
      details: parseMysqlDuplicate(err?.sqlMessage || err?.message),
    };
  }
  if (err?.code === 'ER_NO_REFERENCED_ROW_2' || err?.errno === 1452) {
    return {
      status: 400,
      message: 'Foreign key constraint fails (referenced row not found)',
      code: err.code,
    };
  }
  if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451) {
    return {
      status: 409,
      message: 'Foreign key constraint fails (row is referenced elsewhere)',
      code: err.code,
    };
  }

  // 4) JWT ошибки (если verify бросает)
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return {
      status: 401,
      message: 'Invalid or expired token',
      code: err.name,
    };
  }

  // 5) Файлы (multer)
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      message: 'Uploaded file too large',
      code: err.code,
    };
  }

  // 6) По умолчанию — 500
  return {
    status: 500,
    message: 'Internal Server Error',
    code: err?.code,
  };
}

/**
 * Пытаемся выдернуть поле из сообщения MySQL 1062:
 * Example: "Duplicate entry 'admin@example.com' for key 'users.email'"
 */
function parseMysqlDuplicate(msg = '') {
  // вернём { value, key } если получилось распарсить
  const m = msg.match(/Duplicate entry '(.+?)' for key '(.+?)'/i);
  if (!m) return undefined;
  return { value: m[1], key: m[2] };
}

module.exports = (err, req, res, next) => {
  // Лог для сервера (всегда)
  // В dev — полный стек, в prod — короткое сообщение
  if (!isProd) {
    console.error('[errorHandler]', err);
  } else {
    console.error('[errorHandler]', err?.message || err);
  }

  const normalized = normalizeError(err);
  const { status, message, code, details } = normalized;

  const body = { message };
  if (!isProd) {
    if (code) body.code = code;
    if (details) body.details = details;
    // В dev полезно видеть стек
    if (err?.stack) body.stack = err.stack;
  } else {
    // В prod не отдаём stack/details, только при явной валидации можно вернуть details
    if (details && normalized.status === 400) body.details = details;
    if (code) body.code = code;
  }

  res.status(status).json(body);
};
