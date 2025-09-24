'use strict';

const { getPool } = require('../config/db');

// безопасные сортировки
function buildOrder(sort) {
  const map = {
    publish_date: 'c.publish_date',
    id: 'c.id',
  };
  if (!sort) return `${map.publish_date} DESC, ${map.id} DESC`;
  const desc = String(sort).startsWith('-');
  const raw  = desc ? String(sort).slice(1) : String(sort);
  const col  = map[raw] || map.publish_date;
  return `${col} ${desc ? 'DESC' : 'ASC'}, ${map.id} DESC`;
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  const x = Number.isFinite(n) ? Math.trunc(n) : def;
  return Math.min(Math.max(x, min), max);
}

/* ------------ READ ------------ */

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        c.id, c.post_id, c.author_id, c.publish_date, c.content, c.status, c.locked,
        u.login  AS author_login,
        u.full_name AS author_name
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.id = ?
    `,
    [id]
  );
  return rows[0] || null;
}

async function findByIdTx(conn, id) {
  const [rows] = await conn.query(
    `
      SELECT
        c.id, c.post_id, c.author_id, c.publish_date, c.content, c.status, c.locked,
        u.login  AS author_login,
        u.full_name AS author_name
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.id = ?
    `,
    [id]
  );
  return rows[0] || null;
}

/* ------------ LIST BY POST ------------ */
/**
 * Видимость:
 *  - аноним: только active
 *  - пользователь: чужие только active, свои любые
 *  - админ: любые, можно фильтровать по status
 */
async function listByPost(postId, { limit, offset, sort, status, actor } = {}) {
  const pool = getPool();

  const safeLimit  = clampInt(limit, 10, 1, 100);
  const safeOffset = clampInt(offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const orderSql   = buildOrder(sort);

  const where = ['c.post_id = ?'];
  const params = [Number(postId)];

  const isAdmin = actor && actor.role === 'admin';
  const isUser  = actor && Number.isFinite(Number(actor.id));

  if (isAdmin) {
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
  } else if (isUser) {
    // чужие только active, свои любые
    where.push('(c.status = "active" OR c.author_id = ?)');
    params.push(Number(actor.id));
  } else {
    // аноним
    where.push('c.status = "active"');
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const dataSql = `
    SELECT
      c.id, c.post_id, c.author_id, c.publish_date, c.content, c.status, c.locked,
      u.login AS author_login, u.full_name AS author_name
    FROM comments c
    JOIN users u ON u.id = c.author_id
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [rows] = await pool.query(dataSql, params);

  const countSql = `
    SELECT COUNT(*) AS c
    FROM comments c
    ${whereSql}
  `;
  const [[{ c }]] = await pool.query(countSql, params);

  return { items: rows, total: c, limit: safeLimit, offset: safeOffset };
}

/* ------------ CUD (TX) ------------ */

async function createCommentTx(conn, { post_id, author_id, content, status = 'active' }) {
  const [res] = await conn.execute(
    `
      INSERT INTO comments (post_id, author_id, content, status)
      VALUES (?, ?, ?, ?)
    `,
    [post_id, author_id, content, status]
  );
  return res.insertId;
}

async function updateCommentTx(conn, id, patch = {}) {
  const fields = [];
  const params = [];
  if (patch.content !== undefined) { fields.push('content = ?'); params.push(patch.content); }
  if (patch.status  !== undefined) { fields.push('status  = ?'); params.push(patch.status); }
  // locked намеренно не редактируем здесь — для этого есть setCommentLockTx
  if (!fields.length) return 0;
  params.push(id);
  const [res] = await conn.execute(
    `UPDATE comments SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows;
}

async function deleteCommentTx(conn, id) {
  const [res] = await conn.execute(`DELETE FROM comments WHERE id = ?`, [id]);
  return res.affectedRows;
}

/* ------------ LOCK (TX) ------------ */

async function setCommentLockTx(conn, id, locked) {
  const [res] = await conn.execute(
    `UPDATE comments SET locked = ? WHERE id = ?`,
    [locked ? 1 : 0, id]
  );
  return res.affectedRows;
}

module.exports = {
  findById,
  findByIdTx,
  listByPost,
  createCommentTx,
  updateCommentTx,
  deleteCommentTx,
  setCommentLockTx, // ← добавлено
};
