// src/services/likesService.js
'use strict';

const { getPool }   = require('../config/db');
const likesRepo     = require('../repositories/likesRepo');
const postsRepo     = require('../repositories/postsRepo');
const commentsRepo  = require('../repositories/commentsRepo');
const usersRepo     = require('../repositories/usersRepo'); // ⬅ пересчёт рейтинга

function BadRequest(msg='Bad request'){ const e=new Error(msg); e.name='BadRequestError'; e.status=400; return e; }
function NotFound(msg='Not found'){ const e=new Error(msg); e.name='NotFoundError'; e.status=404; return e; }

const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT || 10);
const MAX = Number(process.env.PAGINATION_LIMIT_MAX || 100);

function clampInt(value, def, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : def;
  return Math.min(Math.max(v, min), max);
}

function normalizeOrder(order) {
  return String(order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

function normalizeSortBy(sortBy, allowed = ['created_at', 'id']) {
  const s = String(sortBy || 'created_at');
  return allowed.includes(s) ? s : 'created_at';
}

/**
 * type: 'like' | 'dislike'
 * target: { post_id? , comment_id? } — XOR
 */
module.exports = {
  async setLike(actor, { type, post_id = null, comment_id = null }) {
    if (!['like','dislike'].includes(type)) throw BadRequest('Invalid type');
    if ((post_id && comment_id) || (!post_id && !comment_id)) {
      throw BadRequest('Provide exactly one target: post_id XOR comment_id');
    }

    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let authorId = null;

      if (post_id) {
        const post = await postsRepo.findByIdTx(conn, post_id);
        if (!post) throw NotFound('Post not found');

        await likesRepo.upsertPostLikeTx(conn, { author_id: actor.id, post_id, type });
        authorId = Number(post.author_id);
      } else {
        const comment = await commentsRepo.findByIdTx(conn, comment_id);
        if (!comment) throw NotFound('Comment not found');

        await likesRepo.upsertCommentLikeTx(conn, { author_id: actor.id, comment_id, type });
        authorId = Number(comment.author_id);
      }

      // ⬇ пересчёт рейтинга автора (в той же транзакции)
      if (Number.isFinite(authorId)) {
        const rating = await usersRepo.computeRatingForUserTx(conn, authorId);
        await usersRepo.upsertUserRatingTx(conn, authorId, rating);
      }

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  async removeLike(actor, { post_id = null, comment_id = null }) {
    if ((post_id && comment_id) || (!post_id && !comment_id)) {
      throw BadRequest('Provide exactly one target: post_id XOR comment_id');
    }
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let authorId = null;

      if (post_id) {
        // узнаём автора поста, чтобы позже пересчитать рейтинг
        const post = await postsRepo.findByIdTx(conn, post_id);
        if (!post) throw NotFound('Post not found');

        await likesRepo.removePostLikeTx(conn, { author_id: actor.id, post_id });
        authorId = Number(post.author_id);
      } else {
        const comment = await commentsRepo.findByIdTx(conn, comment_id);
        if (!comment) throw NotFound('Comment not found');

        await likesRepo.removeCommentLikeTx(conn, { author_id: actor.id, comment_id });
        authorId = Number(comment.author_id);
      }

      // ⬇ пересчёт рейтинга автора (в той же транзакции)
      if (Number.isFinite(authorId)) {
        const rating = await usersRepo.computeRatingForUserTx(conn, authorId);
        await usersRepo.upsertUserRatingTx(conn, authorId, rating);
      }

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // ===== LISTS (для PDF) =====
  async listPostLikes({ postId, limit, offset, sortBy, order }) {
    const id = Number(postId);
    if (!Number.isInteger(id) || id < 1) throw BadRequest('postId must be positive integer');

    // существует ли пост
    const post = await (postsRepo.findById ? postsRepo.findById(id) : null);
    if (!post) throw NotFound('Post not found');

    const safeLimit  = clampInt(limit, DEF, 1, MAX);
    const safeOffset = clampInt(offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const safeSortBy = normalizeSortBy(sortBy, ['created_at', 'id']);
    const safeOrder  = normalizeOrder(order);

    // Вернёт { items, total, limit, offset }
    return likesRepo.listPostLikes({
      postId: id,
      limit: safeLimit,
      offset: safeOffset,
      sortBy: safeSortBy,
      order: safeOrder,
    });
  },

  async listCommentLikes({ commentId, limit, offset, sortBy, order }) {
    const id = Number(commentId);
    if (!Number.isInteger(id) || id < 1) throw BadRequest('commentId must be positive integer');

    // существует ли комментарий
    const comment = await (commentsRepo.findById ? commentsRepo.findById(id) : null);
    if (!comment) throw NotFound('Comment not found');

    const safeLimit  = clampInt(limit, DEF, 1, MAX);
    const safeOffset = clampInt(offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const safeSortBy = normalizeSortBy(sortBy, ['created_at', 'id']);
    const safeOrder  = normalizeOrder(order);

    return likesRepo.listCommentLikes({
      commentId: id,
      limit: safeLimit,
      offset: safeOffset,
      sortBy: safeSortBy,
      order: safeOrder,
    });
  },
};
