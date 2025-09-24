'use strict';

const { getPool } = require('../config/db');
const env = require('../config/env');

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

// маппинг безопасных полей сортировки (+ алиас rating -> likes_net)
function buildOrder(sort) {
  const map = {
    likes: 'likes_net',              // нетто-лайки (like - dislike)
    rating: 'likes_net',             // алиас, часто встречается в ТЗ
    publish_date: 'p.publish_date',
    title: 'p.title',
    id: 'p.id',
  };

  if (!sort) {
    // по умолчанию — рейтинг, затем по дате, затем по id (стабильный тай-брейкер)
    return `${map.likes} DESC, ${map.publish_date} DESC, ${map.id} DESC`;
  }

  const desc = String(sort).startsWith('-');
  const raw = desc ? String(sort).slice(1) : String(sort);
  const col = map[raw] || map.publish_date;

  return `${col} ${desc ? 'DESC' : 'ASC'}, ${map.id} DESC`;
}

/* ---------- READ ONE ---------- */

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        p.id, p.author_id, p.title, p.publish_date, p.status, p.locked, p.content, p.image,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status='active')   AS comments_count,
        (SELECT COUNT(*) FROM likes    l WHERE l.post_id = p.id AND l.type='like')       AS likes_count,
        (SELECT COUNT(*) FROM likes    l WHERE l.post_id = p.id AND l.type='dislike')    AS dislikes_count
      FROM posts p
      WHERE p.id = ?
    `,
    [id]
  );
  return rows[0] || null;
}

async function findByIdTx(conn, id) {
  const [rows] = await conn.query(
    `
      SELECT
        p.id, p.author_id, p.title, p.publish_date, p.status, p.locked, p.content, p.image,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status='active')   AS comments_count,
        (SELECT COUNT(*) FROM likes    l WHERE l.post_id = p.id AND l.type='like')       AS likes_count,
        (SELECT COUNT(*) FROM likes    l WHERE l.post_id = p.id AND l.type='dislike')    AS dislikes_count
      FROM posts p
      WHERE p.id = ?
    `,
    [id]
  );
  return rows[0] || null;
}

/* ---------- CREATE / UPDATE / DELETE (TX) ---------- */

async function createPostTx(conn, { author_id, title, content, image = null, status = 'active' }) {
  const [res] = await conn.execute(
    `
      INSERT INTO posts (author_id, title, content, image, status)
      VALUES (?, ?, ?, ?, ?)
    `,
    [author_id, title, content, image, status]
  );
  return res.insertId;
}

async function updatePostTx(conn, id, patch = {}) {
  const fields = [];
  const params = [];

  if (patch.title !== undefined)        { fields.push('title = ?');        params.push(patch.title); }
  if (patch.content !== undefined)      { fields.push('content = ?');      params.push(patch.content); }
  if (patch.image !== undefined)        { fields.push('image = ?');        params.push(patch.image ?? null); }
  if (patch.status !== undefined)       { fields.push('status = ?');       params.push(patch.status); }
  if (patch.publish_date !== undefined) { fields.push('publish_date = ?'); params.push(patch.publish_date); }
  // locked намеренно НЕ редактируем через общий update — для этого есть setPostLockTx

  if (!fields.length) return 0;

  params.push(id);
  const [res] = await conn.execute(
    `UPDATE posts SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows;
}

async function deletePostTx(conn, id) {
  const [res] = await conn.execute(`DELETE FROM posts WHERE id = ?`, [id]);
  return res.affectedRows;
}

/* ---------- LOCK (TX) ---------- */

async function setPostLockTx(conn, id, locked) {
  const [res] = await conn.execute(
    `UPDATE posts SET locked = ? WHERE id = ?`,
    [locked ? 1 : 0, id]
  );
  return res.affectedRows;
}

/* ---------- CATEGORIES (TX) ---------- */

async function attachCategoriesTx(conn, postId, categoryIds = []) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return 0;
  const values = categoryIds.map(() => '(?, ?)').join(', ');
  const params = [];
  for (const cid of categoryIds) {
    params.push(postId, cid);
  }
  // IGNORE — чтобы не падать на дубликатах
  const [res] = await conn.query(
    `INSERT IGNORE INTO posts_categories (post_id, category_id) VALUES ${values}`,
    params
  );
  return res.affectedRows;
}

async function replaceCategoriesTx(conn, postId, categoryIds = []) {
  await conn.execute(`DELETE FROM posts_categories WHERE post_id = ?`, [postId]);
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return 0;
  return attachCategoriesTx(conn, postId, categoryIds);
}

/* ---------- LIST (filters + pagination + sorting) ---------- */
/**
 * Список постов с фильтрами и дефолтной сортировкой по нетто-лайкам.
 * Возвращает также флаг p.locked.
 */
async function listPosts({
  q,
  author_id,
  category,
  status,
  dateFrom,
  dateTo,
  limit,
  offset,
  sort,
  actor
} = {}) {
  const pool = getPool();

  const DEF = Number(env.PAGINATION_LIMIT_DEFAULT) || 10;
  const MAX = Number(env.PAGINATION_LIMIT_MAX) || 100;
  const safeLimit  = clampInt(limit,  DEF, 1, MAX);
  const safeOffset = clampInt(offset, 0,   0, Number.MAX_SAFE_INTEGER);

  const whereParts = [];
  const whereParams = [];

  // Поиск по заголовку/контенту (экранируем wildcard'ы)
  if (q && q.trim()) {
    const qEsc = escapeLike(q.trim());
    whereParts.push('(LOWER(p.title) LIKE LOWER(?) ESCAPE \'\\\\\' OR LOWER(p.content) LIKE LOWER(?) ESCAPE \'\\\\\')');
    whereParams.push(`%${qEsc}%`, `%${qEsc}%`);
  }

  if (author_id) {
    whereParts.push('p.author_id = ?');
    whereParams.push(Number(author_id));
  }

  // Фильтр по дате публикации (интервал)
  if (dateFrom) {
    whereParts.push('p.publish_date >= ?');
    whereParams.push(dateFrom);
  }
  if (dateTo) {
    whereParts.push('p.publish_date <= ?');
    whereParams.push(dateTo);
  }

  // Видимость в зависимости от роли
  const isAdmin = actor && actor.role === 'admin';
  const isUser = actor && Number.isFinite(Number(actor.id));
  if (!isAdmin) {
    if (isUser) {
      // чужие только активные + свои любые
      whereParts.push('(p.status = "active" OR p.author_id = ?)');
      whereParams.push(Number(actor.id));
    } else {
      // аноним — только активные
      whereParts.push('p.status = "active"');
    }
  } else if (status) {
    // админ может явно фильтровать по статусу
    whereParts.push('p.status = ?');
    whereParams.push(status);
  }

  // фильтр по категории через JOIN
  let joinCategory = '';
  const joinParams = [];
  if (category) {
    joinCategory = 'JOIN posts_categories pc ON pc.post_id = p.id AND pc.category_id = ?';
    joinParams.push(Number(category));
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const orderSql = buildOrder(sort);

  // итоговые параметры — ВАЖНО: сначала params для JOIN, потом для WHERE (по порядку '?' в SQL)
  const paramsAll = [...joinParams, ...whereParams];

  // ===== данные
  const dataSql = `
    SELECT
      p.id, p.author_id, p.title, p.publish_date, p.status, p.locked, p.content, p.image,
      u.login AS author_login, u.full_name AS author_name,
      -- агрегаты лайков для сортировки и отображения
      COALESCE(agg.likes_count, 0)    AS likes_count,
      COALESCE(agg.dislikes_count, 0) AS dislikes_count,
      COALESCE(agg.likes_net, 0)      AS likes_net,
      -- счётчик активных комментариев (для карточек)
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'active') AS comments_count
    FROM posts p
    JOIN users u ON u.id = p.author_id
    ${joinCategory}
    LEFT JOIN (
      SELECT
        l.post_id,
        SUM(l.type = 'like')    AS likes_count,
        SUM(l.type = 'dislike') AS dislikes_count,
        SUM(l.type = 'like') - SUM(l.type = 'dislike') AS likes_net
      FROM likes l
      WHERE l.post_id IS NOT NULL
      GROUP BY l.post_id
    ) agg ON agg.post_id = p.id
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [rows] = await pool.query(dataSql, paramsAll);

  // ===== total (без join агрегата и без LIMIT)
  const countSql = `
    SELECT COUNT(DISTINCT p.id) AS c
    FROM posts p
    ${joinCategory}
    ${whereSql}
  `;
  const [[{ c }]] = await pool.query(countSql, paramsAll);

  return { items: rows, total: c, limit: safeLimit, offset: safeOffset };
}

module.exports = {
  // read
  findById,
  findByIdTx,
  // write (tx)
  createPostTx,
  updatePostTx,
  deletePostTx,
  setPostLockTx,          // ← добавлено
  attachCategoriesTx,
  replaceCategoriesTx,
  // list
  listPosts,
};
