// src/repositories/usersRepo.js
'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');

// -------- helpers --------
function nowPlusDays(days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function clampInt(value, def, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : def;
  const i = Math.trunc(v);
  return Math.min(Math.max(i, min), max);
}

// экранируем спецсимволы LIKE и сам backslash
function escapeLike(str) {
  return String(str).replace(/([\\%_])/g, '\\$1');
}

// безопасный whitelist сортировки
function buildOrder(sort) {
  const map = {
    rating:     'COALESCE(ur.rating, 0)',
    created_at: 'u.created_at',
    login:      'u.login',
    id:         'u.id',
  };

  if (!sort) {
    // по умолчанию — по рейтингу, затем по дате создания, затем стабильный тай-брейкер по id
    return `${map.rating} DESC, ${map.created_at} DESC, ${map.id} DESC`;
  }

  const parts = String(sort).split(',').map(s => s.trim()).filter(Boolean);
  const pieces = [];

  for (const p of parts) {
    const desc = p.startsWith('-');
    const key  = desc ? p.slice(1) : p;
    const col  = map[key];
    if (col) pieces.push(`${col} ${desc ? 'DESC' : 'ASC'}`);
  }

  if (!pieces.length) {
    pieces.push(`${map.rating} DESC`);
  }
  // стабильный тай-брейкер
  pieces.push(`${map.id} DESC`);
  return pieces.join(', ');
}

// ==============================
//        POOL (read)
// ==============================

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findByLoginOrEmail(login, email) {
  const pool = getPool();
  if (login && !email) email = login;
  if (email && !login) login = email;

  const [rows] = await pool.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.login = ? OR u.email = ?
     LIMIT 1`,
    [login, email]
  );
  return rows[0] || null;
}

async function findByLogin(login) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.login = ?
     LIMIT 1`,
    [login]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

// поддержка фильтра по role, поиска q и сортировки (включая rating)
async function listUsers({ q, role, limit = 10, offset = 0, sort = '-rating' } = {}) {
  const pool = getPool();
  const params = [];
  const conds  = [];

  if (q && q.trim()) {
    const qEsc = escapeLike(q.trim());
    conds.push(`(LOWER(u.login) LIKE LOWER(?) ESCAPE '\\\\'
              OR LOWER(u.email) LIKE LOWER(?) ESCAPE '\\\\'
              OR LOWER(u.full_name) LIKE LOWER(?) ESCAPE '\\\\')`);
    params.push(`%${qEsc}%`, `%${qEsc}%`, `%${qEsc}%`);
  }
  if (role) {
    conds.push(`u.role = ?`);
    params.push(role);
  }

  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const orderSql = buildOrder(sort);

  const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT) || 10;
  const MAX = Number(process.env.PAGINATION_LIMIT_MAX) || 100;
  const safeLimit  = clampInt(limit,  DEF, 1, MAX);
  const safeOffset = clampInt(offset, 0,   0, Number.MAX_SAFE_INTEGER);

  const sql = `
  SELECT u.*, COALESCE(ur.rating, 0) AS rating
  FROM users u
  LEFT JOIN user_ratings ur ON ur.user_id = u.id
  ${whereSql}
  ORDER BY ${orderSql}
  LIMIT ${safeLimit} OFFSET ${safeOffset}
`;
const [rows] = await pool.query(sql, params); // params только для WHERE


  // count — по users, без JOIN (быстрее)
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users u ${whereSql}`,
    params
  );

  return { items: rows, total: c, limit: safeLimit, offset: safeOffset };
}

// ==============================
//        TX (read/write)
// ==============================

async function findByIdTx(conn, id) {
  const [rows] = await conn.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findByLoginTx(conn, login) {
  const [rows] = await conn.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.login = ?
     LIMIT 1`,
    [login]
  );
  return rows[0] || null;
}

async function findByEmailTx(conn, email) {
  const [rows] = await conn.execute(
    `SELECT u.*, COALESCE(ur.rating, 0) AS rating
     FROM users u
     LEFT JOIN user_ratings ur ON ur.user_id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function createUserTx(conn, { login, email, password_hash, full_name, role }) {
  if (typeof role === 'undefined') {
    const [res] = await conn.execute(
      `INSERT INTO users (login, email, password_hash, full_name)
       VALUES (?, ?, ?, ?)`,
      [login, email, password_hash, full_name]
    );
    return res.insertId;
  } else {
    const [res] = await conn.execute(
      `INSERT INTO users (login, email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?, ?)`,
      [login, email, password_hash, full_name, role]
    );
    return res.insertId;
  }
}

async function updateMeTx(conn, id, { full_name, profile_picture }) {
  const fields = [];
  const params = [];
  if (full_name !== undefined)       { fields.push('full_name = ?');       params.push(full_name); }
  if (profile_picture !== undefined) { fields.push('profile_picture = ?'); params.push(profile_picture); }
  if (!fields.length) return 0;
  params.push(id);
  const [res] = await conn.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows;
}

async function setRoleTx(conn, id, role) {
  const [res] = await conn.execute(
    `UPDATE users SET role = ? WHERE id = ?`,
    [role, id]
  );
  return res.affectedRows;
}

async function updatePasswordTx(conn, user_id, password_hash) {
  const [res] = await conn.execute(
    `UPDATE users SET password_hash = ? WHERE id = ?`,
    [password_hash, user_id]
  );
  return res.affectedRows;
}

async function deleteUserTx(conn, id) {
  const [res] = await conn.execute(
    `DELETE FROM users WHERE id = ?`,
    [id]
  );
  return res.affectedRows;
}

/**
 * NEW: Универсальный апдейт пользователя админом
 */
async function updateUserTx(conn, id, patch = {}) {
  const fields = [];
  const params = [];

  if (patch.login !== undefined)           { fields.push('login = ?');            params.push(patch.login); }
  if (patch.email !== undefined)           { fields.push('email = ?');            params.push(patch.email); }
  if (patch.full_name !== undefined)       { fields.push('full_name = ?');        params.push(patch.full_name); }
  if (patch.profile_picture !== undefined) { fields.push('profile_picture = ?');  params.push(patch.profile_picture); }
  if (patch.role !== undefined)            { fields.push('role = ?');             params.push(patch.role); }
  if (patch.password_hash !== undefined)   { fields.push('password_hash = ?');    params.push(patch.password_hash); }

  if (!fields.length) return 0;

  params.push(id);
  const [res] = await conn.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows;
}

/**
 * NEW: Считаем rating = (лайки - дизлайки) по постам и комментариям пользователя
 * Выполнять внутри текущей транзакции
 */
async function computeRatingForUserTx(conn, user_id) {
  const [[{ r_posts }]] = await conn.query(
    `
      SELECT COALESCE(SUM(CASE WHEN l.type='like' THEN 1 WHEN l.type='dislike' THEN -1 ELSE 0 END), 0) AS r_posts
      FROM posts p
      LEFT JOIN likes l ON l.post_id = p.id
      WHERE p.author_id = ?
    `,
    [user_id]
  );
  const [[{ r_comments }]] = await conn.query(
    `
      SELECT COALESCE(SUM(CASE WHEN l.type='like' THEN 1 WHEN l.type='dislike' THEN -1 ELSE 0 END), 0) AS r_comments
      FROM comments c
      LEFT JOIN likes l ON l.comment_id = c.id
      WHERE c.author_id = ?
    `,
    [user_id]
  );
  return Number(r_posts || 0) + Number(r_comments || 0);
}

/**
 * NEW: upsert рейтинга в таблицу user_ratings (user_id UNIQUE)
 */
async function upsertUserRatingTx(conn, user_id, rating) {
  await conn.execute(
    `
      INSERT INTO user_ratings (user_id, rating, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()
    `,
    [user_id, rating]
  );
  return true;
}

// ==============================
//        Email tokens
// ==============================

async function createEmailTokenTx(conn, { user_id, ttlDays }) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires_at = nowPlusDays(ttlDays);
  await conn.execute(
    `INSERT INTO email_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)`,
    [user_id, token, expires_at]
  );
  return token;
}

async function findEmailTokenTx(conn, token) {
  const [rows] = await conn.execute(
    `SELECT * FROM email_tokens WHERE token = ? LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

async function deleteEmailTokenTx(conn, id) {
  const [res] = await conn.execute(
    `DELETE FROM email_tokens WHERE id = ?`,
    [id]
  );
  return res.affectedRows;
}

async function markEmailConfirmedTx(conn, user_id) {
  const [res] = await conn.execute(
    `UPDATE users SET email_confirmed = 1 WHERE id = ?`,
    [user_id]
  );
  return res.affectedRows;
}

// ==============================
//        Reset tokens
// ==============================

async function createResetTokenTx(conn, { user_id, ttlDays }) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires_at = nowPlusDays(ttlDays);
  await conn.execute(
    `INSERT INTO reset_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)`,
    [user_id, token, expires_at]
  );
  return token;
}

async function findResetTokenTx(conn, token) {
  const [rows] = await conn.execute(
    `SELECT * FROM reset_tokens WHERE token = ? LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

async function deleteResetTokenTx(conn, id) {
  const [res] = await conn.execute(
    `DELETE FROM reset_tokens WHERE id = ?`,
    [id]
  );
  return res.affectedRows;
}

// -------- exports --------
module.exports = {
  // pool
  findById,
  findByLoginOrEmail,
  findByLogin,
  findByEmail,
  listUsers,

  // tx
  findByIdTx,
  findByLoginTx,
  findByEmailTx,
  createUserTx,
  updateMeTx,
  setRoleTx,
  updatePasswordTx,
  deleteUserTx,
  updateUserTx,             // NEW
  computeRatingForUserTx,   // NEW
  upsertUserRatingTx,       // NEW

  // email tokens
  createEmailTokenTx,
  findEmailTokenTx,
  deleteEmailTokenTx,
  markEmailConfirmedTx,

  // reset tokens
  createResetTokenTx,
  findResetTokenTx,
  deleteResetTokenTx,
};
