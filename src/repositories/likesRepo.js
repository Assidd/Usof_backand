// src/repositories/likesRepo.js
'use strict';
const { getPool } = require('../config/db');
function use(conn) { return conn || getPool(); }

function clampInt(value, def, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : def;
  const i = Math.trunc(v);
  return Math.min(Math.max(i, min), max);
}

function buildOrder(sortBy, order) {
  const field = String(sortBy || 'created_at');
  const dir = String(order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  // В БД поле называется publish_date — маппим created_at -> publish_date
  const col = field === 'id' ? 'l.id' : 'l.publish_date';
  return `${col} ${dir}`;
}

/* =========================
   POST likes
   ========================= */
async function upsertPostLike(conn, { author_id, post_id, type }) {
  const sql = `
    INSERT INTO likes (author_id, post_id, comment_id, type)
    VALUES (?, ?, NULL, ?)
    ON DUPLICATE KEY UPDATE
      type = VALUES(type),
      publish_date = NOW()
  `;
  const [res] = await use(conn).execute(sql, [author_id, post_id, type]);
  return res.affectedRows;
}

async function removePostLike(conn, { author_id, post_id }) {
  const [res] = await use(conn).execute(
    `DELETE FROM likes WHERE author_id = ? AND post_id = ?`,
    [author_id, post_id]
  );
  return res.affectedRows;
}

async function getUserPostLike(conn, { author_id, post_id }) {
  const [rows] = await use(conn).execute(
    `SELECT id, author_id, post_id, type, publish_date
     FROM likes
     WHERE author_id = ? AND post_id = ?
     LIMIT 1`,
    [author_id, post_id]
  );
  return rows[0] || null;
}

async function countPostLikes(conn, postId) {
  const sql = `
    SELECT
      COALESCE(SUM(type='like'), 0)    AS likes,
      COALESCE(SUM(type='dislike'), 0) AS dislikes
    FROM likes
    WHERE post_id = ?
  `;
  const [rows] = await use(conn).execute(sql, [postId]);
  return {
    likes: Number(rows[0]?.likes || 0),
    dislikes: Number(rows[0]?.dislikes || 0)
  };
}

/* =========================
   COMMENT likes
   ========================= */
async function upsertCommentLike(conn, { author_id, comment_id, type }) {
  const sql = `
    INSERT INTO likes (author_id, post_id, comment_id, type)
    VALUES (?, NULL, ?, ?)
    ON DUPLICATE KEY UPDATE
      type = VALUES(type),
      publish_date = NOW()
  `;
  const [res] = await use(conn).execute(sql, [author_id, comment_id, type]);
  return res.affectedRows;
}

async function removeCommentLike(conn, { author_id, comment_id }) {
  const [res] = await use(conn).execute(
    `DELETE FROM likes WHERE author_id = ? AND comment_id = ?`,
    [author_id, comment_id]
  );
  return res.affectedRows;
}

async function getUserCommentLike(conn, { author_id, comment_id }) {
  const [rows] = await use(conn).execute(
    `SELECT id, author_id, comment_id, type, publish_date
     FROM likes
     WHERE author_id = ? AND comment_id = ?
     LIMIT 1`,
    [author_id, comment_id]
  );
  return rows[0] || null;
}

async function countCommentLikes(conn, commentId) {
  const sql = `
    SELECT
      COALESCE(SUM(type='like'), 0)    AS likes,
      COALESCE(SUM(type='dislike'), 0) AS dislikes
    FROM likes
    WHERE comment_id = ?
  `;
  const [rows] = await use(conn).execute(sql, [commentId]);
  return {
    likes: Number(rows[0]?.likes || 0),
    dislikes: Number(rows[0]?.dislikes || 0)
  };
}

/* =========================
   LISTS for PDF (pool-level)
   ========================= */
async function listPostLikes({ postId, limit, offset, sortBy, order }) {
  const pool = use(null);

  const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT) || 10;
  const MAX = Number(process.env.PAGINATION_LIMIT_MAX) || 100;
  const safeLimit  = clampInt(limit,  DEF, 1, MAX);
  const safeOffset = clampInt(offset, 0,   0, Number.MAX_SAFE_INTEGER);
  const orderBy = buildOrder(sortBy, order);

  // Отдаём базовую инфу о пользователе; правь набор полей по вкусу
  const sql = `
    SELECT
      l.id,
      l.author_id AS user_id,
      u.full_name,
      u.email,
      l.type,
      l.publish_date
    FROM likes l
    JOIN users u ON u.id = l.author_id
    WHERE l.post_id = ?
    ORDER BY ${orderBy}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [items] = await pool.query(sql, [postId]);

  const [[{ c }]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM likes WHERE post_id = ?`,
    [postId]
  );

  return { items, total: c, limit: safeLimit, offset: safeOffset };
}

async function listCommentLikes({ commentId, limit, offset, sortBy, order }) {
  const pool = use(null);

  const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT) || 10;
  const MAX = Number(process.env.PAGINATION_LIMIT_MAX) || 100;
  const safeLimit  = clampInt(limit,  DEF, 1, MAX);
  const safeOffset = clampInt(offset, 0,   0, Number.MAX_SAFE_INTEGER);
  const orderBy = buildOrder(sortBy, order);

  const sql = `
    SELECT
      l.id,
      l.author_id AS user_id,
      u.full_name,
      u.email,
      l.type,
      l.publish_date
    FROM likes l
    JOIN users u ON u.id = l.author_id
    WHERE l.comment_id = ?
    ORDER BY ${orderBy}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [items] = await pool.query(sql, [commentId]);

  const [[{ c }]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM likes WHERE comment_id = ?`,
    [commentId]
  );

  return { items, total: c, limit: safeLimit, offset: safeOffset };
}

/* =========================
   Tx-алиасы (для совместимости с сервисом)
   ========================= */
const upsertPostLikeTx       = upsertPostLike;
const removePostLikeTx       = removePostLike;
const upsertCommentLikeTx    = upsertCommentLike;
const removeCommentLikeTx    = removeCommentLike;

module.exports = {
  // base
  upsertPostLike,
  removePostLike,
  getUserPostLike,
  countPostLikes,
  upsertCommentLike,
  removeCommentLike,
  getUserCommentLike,
  countCommentLikes,

  // lists
  listPostLikes,
  listCommentLikes,

  // tx aliases (ожидаются likesService)
  upsertPostLikeTx,
  removePostLikeTx,
  upsertCommentLikeTx,
  removeCommentLikeTx,
};
