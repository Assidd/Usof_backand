// src/controllers/commentController.js
'use strict';

const commentsService = require('../services/commentsService');

// GET /comments/post/:postId?limit=&offset=&sort=&status=
module.exports = {
  async listByPost(req, res, next) {
    try {
      const postId = Number(req.params.postId);
      const limit  = Number(req.query.limit ?? 10);
      const offset = Number(req.query.offset ?? 0);
      const sort   = req.query.sort || '-publish_date';
      const status = req.query.status; // admin-only (service сам проверит)
      const actor  = req.user || null; // может быть undefined (аноним)

      const data = await commentsService.listByPost(postId, { limit, offset, sort, status }, actor);
      res.json(data);
    } catch (e) { next(e); }
  },

  // GET /comments/:id
  async getById(req, res, next) {
    try {
      const id    = Number(req.params.id);
      const actor = req.user || null;

      const data = await commentsService.findById(id, actor);
      res.json(data);
    } catch (e) { next(e); }
  },

  // POST /comments
  // src/controllers/commentController.js
async create(req, res, next) {
  try {
    const { post_id, content } = req.body;       // ← ИМЕННО post_id
    const created = await commentsService.create(req.user, { post_id, content });
    res.status(201).json(created);
  } catch (e) { next(e); }
},

  // PATCH /comments/:id
  async update(req, res, next) {
    try {
      const id = Number(req.params.id);
      const { status } = req.body; // 💡 по ТЗ — можно менять только статус
      const updated = await commentsService.update(req.user, id, { status });
      res.json(updated);
    } catch (e) { next(e); }
  },

  // DELETE /comments/:id
  async remove(req, res, next) {
    try {
      const id = Number(req.params.id);
      await commentsService.remove(req.user, id);
      res.status(204).end();
    } catch (e) { next(e); }
  },

  // ─────────────────────────────────────────────────────────────
  // NESTED обёртки под PDF-маршруты: /api/posts/:id/comments
  // ─────────────────────────────────────────────────────────────

  // GET /api/posts/:id/comments
  async listForPost(req, res, next) {
    try {
      const postId = Number(req.params.id);

      // поддержим и page/limit, и offset/limit
      const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT || 10);
      const MAX = Number(process.env.PAGINATION_LIMIT_MAX || 100);

      const limit  = Math.min(Number(req.query.limit ?? DEF), MAX);
      const offset = req.query.offset != null
        ? Math.max(0, Number(req.query.offset))
        : (req.query.page != null ? Math.max(0, (Number(req.query.page) - 1) * limit) : 0);

      // конвертим sortBy+order → старый формат sort ('-publish_date' и т.п.)
      let sort = req.query.sort || '-publish_date';
      if (!req.query.sort && req.query.sortBy) {
        const field = String(req.query.sortBy);
        const order = String(req.query.order || 'desc').toLowerCase();
        sort = (order.startsWith('asc') ? '' : '-') + field;
      }

      const status = req.query.status; // 'active' | 'inactive' (inactive видит только админ)
      const actor  = req.user || null;

      const data = await commentsService.listByPost(postId, { limit, offset, sort, status }, actor);
      res.json(data);
    } catch (e) { next(e); }
  },

  // POST /api/posts/:id/comments
  async createForPost(req, res, next) {
    try {
      const postId = Number(req.params.id);
      const { content } = req.body;

      const created = await commentsService.create(req.user, { post_id: postId, content });
      res.status(201).json(created);
    } catch (e) { next(e); }
  },

  // PATCH /api/comments/:id/lock (admin only) — { locked: boolean }
  async setLock(req, res, next) {
    try {
      const id = Number(req.params.id);
      const { locked } = req.body;
      const updated = await commentsService.setLock(req.user, id, Boolean(locked));
      res.json(updated);
    } catch (e) { next(e); }
  },
};
