'use strict';

const { getPool } = require('../config/db');
const postsRepo = require('../repositories/postsRepo');

function Forbidden(msg = 'Forbidden') {
  const e = new Error(msg);
  e.name = 'ForbiddenError';
  e.status = 403;
  return e;
}
function NotFound(msg = 'Not found') {
  const e = new Error(msg);
  e.name = 'NotFoundError';
  e.status = 404;
  return e;
}
function BadRequest(msg = 'Bad request') {
  const e = new Error(msg);
  e.name = 'BadRequestError';
  e.status = 400;
  return e;
}

function ensureAdmin(actor) {
  if (!actor || actor.role !== 'admin') throw Forbidden('Admin only');
}

async function ensureOwnerOrAdmin(actor, post) {
  if (!post) throw NotFound('Post not found');
  if (actor?.role === 'admin') return;
  if (!actor || post.author_id !== actor.id) throw Forbidden('Only owner or admin');
}

/**
 * Получить один пост с правилами видимости
 */
async function findById(id, opts = {}) {
  const p = await postsRepo.findById(id);
  if (!p) throw NotFound('Post not found');

  // Нормализация actor/actorId
  let actor = null;
  let actorId = null;

  if (opts && (typeof opts.actorId !== 'undefined' || typeof opts.actor !== 'undefined')) {
    actor = opts.actor ?? null;
    actorId = typeof opts.actorId !== 'undefined' ? opts.actorId : actor?.id ?? null;
  } else {
    actor = opts && typeof opts === 'object' ? opts : null;
    actorId = actor?.id ?? null;
  }

  const isAdmin = (actor?.role === 'admin') || (opts?.role === 'admin');
  const isOwner = actorId != null && Number(actorId) === Number(p.author_id);

  if (p.status !== 'active' && !isAdmin && !isOwner) {
    throw NotFound('Post not available');
  }
  return p;
}

/**
 * Список постов
 */
async function list(query, { actor } = {}) {
  return postsRepo.listPosts({ ...query, actor });
}

/**
 * Создать пост
 */
async function create(actor, { title, content, status = 'active', categoryIds = [], image }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const postId = await postsRepo.createPostTx(conn, {
      author_id: actor.id,
      title,
      content,
      status,
      image,
    });
    if (Array.isArray(categoryIds) && categoryIds.length) {
      await postsRepo.attachCategoriesTx(conn, postId, categoryIds);
    }
    const post = await postsRepo.findByIdTx(conn, postId);
    await conn.commit();
    return post;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Обновить пост
 */
async function update(actor, postId, { title, content, status, categoryIds, image }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await postsRepo.findByIdTx(conn, postId);
    await ensureOwnerOrAdmin(actor, existing);

    const isOwner = !!actor && existing.author_id === actor.id;
    const isAdmin = actor?.role === 'admin';

    if (existing.locked && !isAdmin) {
      throw Forbidden('Post is locked');
    }

    let patchDb = {};
    let replaceCats = null;

    if (isAdmin && !isOwner) {
      if (status !== undefined) patchDb.status = status;
      if (Array.isArray(categoryIds)) replaceCats = categoryIds;
      if (Object.keys(patchDb).length === 0 && replaceCats === null) {
        throw BadRequest('No updatable fields for admin (only status and categories are allowed)');
      }
    } else {
      if (title !== undefined)   patchDb.title = title;
      if (content !== undefined) patchDb.content = content;
      if (image !== undefined)   patchDb.image = image;
      if (status !== undefined)  patchDb.status = status;
      if (Array.isArray(categoryIds)) replaceCats = categoryIds;

      if (Object.keys(patchDb).length === 0 && replaceCats === null) {
        throw BadRequest('No fields to update');
      }
    }

    if (Object.keys(patchDb).length) {
      await postsRepo.updatePostTx(conn, postId, patchDb);
    }
    if (replaceCats !== null) {
      await postsRepo.replaceCategoriesTx(conn, postId, replaceCats);
    }

    const post = await postsRepo.findByIdTx(conn, postId);
    await conn.commit();
    return post;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Удалить пост
 */
async function remove(actor, postId) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await postsRepo.findByIdTx(conn, postId);
    await ensureOwnerOrAdmin(actor, existing);

    if (existing.locked && actor?.role !== 'admin') {
      throw Forbidden('Post is locked');
    }

    await postsRepo.deletePostTx(conn, postId);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Поставить/снять lock (только админ)
 */
async function setLock(actor, postId, locked) {
  ensureAdmin(actor);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await postsRepo.findByIdTx(conn, postId);
    if (!existing) throw NotFound('Post not found');

    if (typeof postsRepo.setPostLockTx === 'function') {
      await postsRepo.setPostLockTx(conn, postId, !!locked);
    } else {
      // fallback, если метода в repo нет
      await conn.execute(`UPDATE posts SET locked = ? WHERE id = ?`, [locked ? 1 : 0, postId]);
    }

    const post = await postsRepo.findByIdTx(conn, postId);
    await conn.commit();
    return post;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Категории поста (для контроллера /posts/:id/categories)
 */
async function listCategoriesByPost(postId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.description
       FROM categories c
       JOIN posts_categories pc ON pc.category_id = c.id
      WHERE pc.post_id = ?`,
    [postId]
  );
  return rows;
}

module.exports = {
  findById,
  list,
  create,
  update,
  remove,
  setLock,
  listCategoriesByPost,
  getCategories: listCategoriesByPost, // алиас для совместимости
};
