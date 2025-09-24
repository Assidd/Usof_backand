// src/routes/likeRoutes.js
'use strict';

const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const likeCtrl = require('../controllers/likeController');

const r = Router();

// Шаблоны валидации
const postIdParam = { params: { postId: { type: 'number', required: true } } };
const commentIdParam = { params: { commentId: { type: 'number', required: true } } };
const likeBody = { body: { type: { type: 'string', required: true, enum: ['like', 'dislike'] } } };

// Список лайков: пагинация и сортировка (по умолчанию — новые сверху)
const listQuery = {
  query: {
    limit:  { type: 'number' },                      // дефолт подтянем в контроллере
    offset: { type: 'number' },
    sortBy: { type: 'string', enum: ['created_at', 'id'] },
    order:  { type: 'string', enum: ['asc', 'desc', 'ASC', 'DESC'] },
  },
};

// -------- POSTS --------

// GET /api/posts/:postId/like — СПИСОК лайков под постом (по PDF)
r.get(
  '/posts/:postId/like',
  validate({ ...postIdParam, ...listQuery }),
  likeCtrl.getPostLike // контроллер вернёт массив записей + meta
);

// POST /api/posts/:postId/like — поставить лайк/дизлайк
r.post(
  '/posts/:postId/like',
  auth,
  validate({ ...postIdParam, ...likeBody }),
  likeCtrl.setPostLike
);

// DELETE /api/posts/:postId/like — снять свою реакцию
r.delete(
  '/posts/:postId/like',
  auth,
  validate(postIdParam),
  likeCtrl.deletePostLike
);

// -------- COMMENTS --------

// GET /api/comments/:commentId/like — СПИСОК лайков под комментом (по PDF)
r.get(
  '/comments/:commentId/like',
  validate({ ...commentIdParam, ...listQuery }),
  likeCtrl.getCommentLike // контроллер вернёт массив записей + meta
);

// POST /api/comments/:commentId/like — поставить лайк/дизлайк
r.post(
  '/comments/:commentId/like',
  auth,
  validate({ ...commentIdParam, ...likeBody }),
  likeCtrl.setCommentLike
);

// DELETE /api/comments/:commentId/like — снять свою реакцию
r.delete(
  '/comments/:commentId/like',
  auth,
  validate(commentIdParam),
  likeCtrl.deleteCommentLike
);

module.exports = r;
