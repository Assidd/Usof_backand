// src/controllers/likeController.js
'use strict';

const likesRepo     = require('../repositories/likesRepo');
const likesService  = require('../services/likesService');

// ---- совместимые вызовы репозитория (работают и с (params), и с (conn, params)) ----
async function repoCountPostLikes(postId) {
  return likesRepo.countPostLikes.length >= 2
    ? likesRepo.countPostLikes(null, postId)
    : likesRepo.countPostLikes(postId);
}
async function repoGetUserPostLike(userId, postId) {
  return likesRepo.getUserPostLike.length >= 2
    ? likesRepo.getUserPostLike(null, { author_id: userId, post_id: postId })
    : likesRepo.getUserPostLike({ author_id: userId, post_id: postId });
}
async function repoCountCommentLikes(commentId) {
  return likesRepo.countCommentLikes.length >= 2
    ? likesRepo.countCommentLikes(null, commentId)
    : likesRepo.countCommentLikes(commentId);
}
async function repoGetUserCommentLike(userId, commentId) {
  return likesRepo.getUserCommentLike.length >= 2
    ? likesRepo.getUserCommentLike(null, { author_id: userId, comment_id: commentId })
    : likesRepo.getUserCommentLike({ author_id: userId, comment_id: commentId });
}

// === helpers ===
function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function ensureId(n, name) {
  const id = Number(n);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`${name} must be positive integer`);
  return id;
}

function parseListQuery(req) {
  const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT || 10);
  const MAX = Number(process.env.PAGINATION_LIMIT_MAX || 100);

  const limit  = Math.min(Number(req.query.limit ?? DEF), MAX);
  const offset = Math.max(0, Number(req.query.offset ?? 0));

  const sortBy = String(req.query.sortBy || 'created_at'); // по умолчанию — новые сверху
  const order  = String(req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return { limit, offset, sortBy, order };
}

async function buildPostLikeSummary(postId, userId) {
  const { likes, dislikes } = await repoCountPostLikes(postId);
  let my = null;
  if (userId) {
    const row = await repoGetUserPostLike(userId, postId);
    if (row?.type) my = row.type; // 'like' | 'dislike'
  }
  return { post_id: postId, likes: Number(likes || 0), dislikes: Number(dislikes || 0), my };
}

async function buildCommentLikeSummary(commentId, userId) {
  const { likes, dislikes } = await repoCountCommentLikes(commentId);
  let my = null;
  if (userId) {
    const row = await repoGetUserCommentLike(userId, commentId);
    if (row?.type) my = row.type;
  }
  return { comment_id: commentId, likes: Number(likes || 0), dislikes: Number(dislikes || 0), my };
}

// ===== POSTS =====

// GET /api/posts/:postId/like — СПИСОК лайков (по PDF)
exports.getPostLike = async (req, res, next) => {
  try {
    const postId = ensureId(req.params.postId, 'postId');
    const { limit, offset, sortBy, order } = parseListQuery(req);

    // Сервис вернёт { items: [...], total, limit, offset }
    const page = await likesService.listPostLikes({ postId, limit, offset, sortBy, order });
    res.json(page);
  } catch (e) { next(e); }
};

exports.setPostLike = async (req, res, next) => {
  try {
    const postId = ensureId(req.params.postId, 'postId');
    const userId = ensureId(req.user.id, 'userId');
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) throw badRequest('type must be like|dislike');

    // транзакционно через сервис (он проверяет, что пост существует)
    await likesService.setLike({ id: userId }, { type, post_id: postId });

    // Можно вернуть обновлённую сводку — удобнее клиенту
    const data = await buildPostLikeSummary(postId, userId);
    res.status(201).json(data);
  } catch (e) { next(e); }
};

exports.deletePostLike = async (req, res, next) => {
  try {
    const postId = ensureId(req.params.postId, 'postId');
    const userId = ensureId(req.user.id, 'userId');

    await likesService.removeLike({ id: userId }, { post_id: postId });

    res.status(204).end();
  } catch (e) { next(e); }
};

// ===== COMMENTS =====

// GET /api/comments/:commentId/like — СПИСОК лайков (по PDF)
exports.getCommentLike = async (req, res, next) => {
  try {
    const commentId = ensureId(req.params.commentId, 'commentId');
    const { limit, offset, sortBy, order } = parseListQuery(req);

    const page = await likesService.listCommentLikes({ commentId, limit, offset, sortBy, order });
    res.json(page);
  } catch (e) { next(e); }
};

exports.setCommentLike = async (req, res, next) => {
  try {
    const commentId = ensureId(req.params.commentId, 'commentId');
    const userId = ensureId(req.user.id, 'userId');
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) throw badRequest('type must be like|dislike');

    // транзакционно через сервис (он проверяет, что комментарий существует)
    await likesService.setLike({ id: userId }, { type, comment_id: commentId });

    const data = await buildCommentLikeSummary(commentId, userId);
    res.status(201).json(data);
  } catch (e) { next(e); }
};

exports.deleteCommentLike = async (req, res, next) => {
  try {
    const commentId = ensureId(req.params.commentId, 'commentId');
    const userId = ensureId(req.user.id, 'userId');

    await likesService.removeLike({ id: userId }, { comment_id: commentId });

    res.status(204).end();
  } catch (e) { next(e); }
};
