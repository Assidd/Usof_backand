'use strict';

const postsService = require('../services/postsService');
const env = require('../config/env');

// ───────────────── helpers ─────────────────
function toPublicUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  const base = (env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const file = String(storedPath).split('/').slice(-1)[0];
  return `${base}/uploads/${file}`;
}

// Нормализуем categories: принимаем [1,2] или "1,2" → [1,2]
function normalizeCategories(val) {
  if (val == null || val === '') return undefined;
  if (Array.isArray(val)) {
    const arr = val.map(n => Number(n)).filter(Number.isFinite);
    return arr.length ? Array.from(new Set(arr)) : undefined;
  }
  if (typeof val === 'string') {
    const arr = val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(n => Number(n))
      .filter(Number.isFinite);
    return arr.length ? Array.from(new Set(arr)) : undefined;
  }
  const n = Number(val);
  return Number.isFinite(n) ? [n] : undefined;
}

// Собираем сортировку: sortBy + order → строка формата repo ("-likes", "title")
function buildSort({ sortBy, order, fallback }) {
  if (!sortBy && !fallback) return undefined;
  if (!sortBy) return String(fallback);
  const dir = String(order || 'DESC').toUpperCase() === 'ASC' ? '' : '-';
  return `${dir}${sortBy}`;
}

module.exports = {
  // GET /posts?categoryId=&authorId=&status=&q=&dateFrom=&dateTo=&limit=&offset=&sortBy=&order=
  async list(req, res, next) {
    try {
      const defLimit = parseInt(process.env.PAGINATION_LIMIT_DEFAULT || '10', 10);
      const maxLimit = parseInt(process.env.PAGINATION_LIMIT_MAX || '100', 10);

      const limit  = Math.min(parseInt(req.query.limit ?? defLimit, 10) || defLimit, maxLimit);
      const offset = parseInt(req.query.offset ?? '0', 10) || 0;

      const sort = buildSort({
        sortBy:  req.query.sortBy,
        order:   req.query.order,
        fallback: req.query.sort ?? '-likes',
      });

      const q = req.query.q ?? '';

      const categoryRaw = req.query.categoryId ?? req.query.category;
      const authorRaw   = req.query.authorId   ?? req.query.author_id;

      const category  = categoryRaw != null ? parseInt(categoryRaw, 10)  : undefined;
      const author_id = authorRaw   != null ? parseInt(authorRaw, 10)    : undefined;

      const status   = req.query.status   ? String(req.query.status)   : undefined;
      const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
      const dateTo   = req.query.dateTo   ? String(req.query.dateTo)   : undefined;

      const data = await postsService.list(
        { q, category, author_id, status, dateFrom, dateTo, limit, offset, sort },
        { actor: req.user || null }
      );

      data.items = data.items.map(p => ({
        ...p,
        image: p.image ? toPublicUrl(p.image) : null,
      }));

      res.json(data);
    } catch (e) { next(e); }
  },

  // GET /posts/:id
  async findById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const post = await postsService.findById(id, { actor: req.user || null });
      if (!post) return res.status(404).json({ message: 'Post not found' });
      post.image = post.image ? toPublicUrl(post.image) : null;
      res.json(post);
    } catch (e) { next(e); }
  },

  // GET /posts/:id/categories
  async getCategories(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const data = await (
        postsService.getCategories
          ? postsService.getCategories(id)
          : postsService.listCategoriesByPost(id)
      );
      res.json(data);
    } catch (e) { next(e); }
  },

  // POST /posts
  async create(req, res, next) {
    try {
      const { title, content, status, image } = req.body;
      const categories = normalizeCategories(req.body.categories);
      const post = await postsService.create(req.user, {
        title, content, status, image,
        categoryIds: categories,
      });
      post.image = post.image ? toPublicUrl(post.image) : null;
      res.status(201).json(post);
    } catch (e) { next(e); }
  },

  // PATCH /posts/:id
  async update(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);

      const existing = await postsService.findById(id, { actor: req.user || null });
      if (!existing) return res.status(404).json({ message: 'Post not found' });

      const isOwner = req.user && existing && req.user.id === existing.author_id;
      const isAdmin = req.user && req.user.role === 'admin';

      const { title, content, status, image } = req.body;
      const categories = normalizeCategories(req.body.categories);

      let patch = { title, content, status, image, categoryIds: categories };

      if (isAdmin && !isOwner) {
        patch = {};
        if (status !== undefined)     patch.status = status;
        if (categories !== undefined) patch.categoryIds = categories;
      }

      const post = await postsService.update(req.user, id, patch);
      post.image = post.image ? toPublicUrl(post.image) : null;
      res.json(post);
    } catch (e) { next(e); }
  },

  // DELETE /posts/:id
  async remove(req, res, next) {
    try {
      const id  = parseInt(req.params.id, 10);
      await postsService.remove(req.user, id);   // ← фикс: был req
      res.status(204).end();
    } catch (e) { next(e); }
  },

  // POST /posts/:id/image  (multipart/form-data)
  async uploadImage(req, res, next) {
    try {
      if (!req.file) {
        const err = new Error('image file is required');
        err.status = 400; throw err;
      }
      const id = parseInt(req.params.id, 10);
      const filename   = req.file.filename;
      const storedPath = `uploads/${filename}`;

      const updated = await postsService.update(req.user, id, { image: storedPath });
      updated.image = updated.image ? toPublicUrl(updated.image) : null;

      res.status(201).json({
        ok: true,
        post_id: id,
        path: storedPath,
        url: toPublicUrl(storedPath),
        post: updated,
      });
    } catch (e) { next(e); }
  },

  // PATCH /posts/:id/lock  (admin only) — { locked: boolean }
  async setLock(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const { locked } = req.body;
      const updated = await postsService.setLock(req.user, id, Boolean(locked));
      updated.image = updated.image ? toPublicUrl(updated.image) : null;
      res.json(updated);
    } catch (e) { next(e); }
  },
};
