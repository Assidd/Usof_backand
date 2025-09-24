'use strict';

const { getPool } = require('../config/db');
const postsRepo = require('../repositories/postsRepo');
const commentsRepo = require('../repositories/commentsRepo');

function Forbidden(msg='Forbidden'){ const e=new Error(msg); e.name='ForbiddenError'; e.status=403; return e; }
function NotFound(msg='Not found'){ const e=new Error(msg); e.name='NotFoundError'; e.status=404; return e; }
function BadRequest(msg='Bad request'){ const e=new Error(msg); e.name='BadRequestError'; e.status=400; return e; }

function ensureAdmin(actor) {
  if (!actor || actor.role !== 'admin') throw Forbidden('Admin only');
}

// админ/владелец
async function ensureOwnerOrAdmin(actor, entity, field='author_id') {
  if (!entity) throw NotFound('Comment not found');
  if (actor?.role === 'admin') return;
  if (!actor || entity[field] !== actor.id) throw Forbidden('Only owner or admin');
}

/** Видимость одного комментария по правилам */
function ensureCanSee(actor, comment) {
  if (!comment) throw NotFound('Comment not found');
  if (comment.status === 'active') return;
  // неактивные: админ или автор
  if (!actor) throw NotFound('Comment not found');
  if (actor.role === 'admin' || comment.author_id === actor.id) return;
  throw NotFound('Comment not found');
}

module.exports = {
  async listByPost(postId, { limit, offset, sort, status } = {}, actor) {
    return commentsRepo.listByPost(postId, { limit, offset, sort, status, actor });
  },

  async findById(id, actor) {
    const c = await commentsRepo.findById(id);
    ensureCanSee(actor, c);
    return c;
  },

  /**
   * Создать комментарий:
   *  - только на активном и НЕЗАБЛОКИРОВАННОМ посте
   */
  async create(actor, { post_id, content }) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const post = await postsRepo.findByIdTx(conn, post_id);
      if (!post) throw NotFound('Post not found');
      if (post.status !== 'active') throw BadRequest('Cannot comment inactive post');
      if (post.locked) throw Forbidden('Post is locked');

      const id = await commentsRepo.createCommentTx(conn, {
        post_id, author_id: actor.id, content, status: 'active',
      });

      const c = await commentsRepo.findByIdTx(conn, id);
      await conn.commit();
      return c;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },

  /**
   * Обновить комментарий:
   *  - менять можно только статус
   *  - при locked (коммент или его пост) — только админ
   */
  async update(actor, commentId, { status, content }) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const existing = await commentsRepo.findByIdTx(conn, commentId);
      await ensureOwnerOrAdmin(actor, existing);

      // запрещаем менять контент вообще
      if (content !== undefined) throw Forbidden('Changing content is not allowed');
      if (status === undefined)  throw BadRequest('Only status can be changed');

      // запрет, если заблокирован сам комментарий и не админ
      if (existing.locked && actor?.role !== 'admin') {
        throw Forbidden('Comment is locked');
      }
      // запрет, если заблокирован родительский пост и не админ
      const parentPost = await postsRepo.findByIdTx(conn, existing.post_id);
      if (parentPost?.locked && actor?.role !== 'admin') {
        throw Forbidden('Post is locked');
      }

      await commentsRepo.updateCommentTx(conn, commentId, { status });
      const c = await commentsRepo.findByIdTx(conn, commentId);
      await conn.commit();
      return c;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },

  /**
   * Удалить комментарий:
   *  - при locked (коммент или его пост) — только админ
   */
  async remove(actor, commentId) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const existing = await commentsRepo.findByIdTx(conn, commentId);
      await ensureOwnerOrAdmin(actor, existing);

      if (existing.locked && actor?.role !== 'admin') {
        throw Forbidden('Comment is locked');
      }
      const parentPost = await postsRepo.findByIdTx(conn, existing.post_id);
      if (parentPost?.locked && actor?.role !== 'admin') {
        throw Forbidden('Post is locked');
      }

      await commentsRepo.deleteCommentTx(conn, commentId);
      await conn.commit();
      return { ok: true };
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },

  /**
   * Поставить/снять lock на комментарий (только админ)
   */
  async setLock(actor, commentId, locked) {
    ensureAdmin(actor);

    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const existing = await commentsRepo.findByIdTx(conn, commentId);
      if (!existing) throw NotFound('Comment not found');

      await commentsRepo.setCommentLockTx(conn, commentId, !!locked);
      const c = await commentsRepo.findByIdTx(conn, commentId);

      await conn.commit();
      return c;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },
};
