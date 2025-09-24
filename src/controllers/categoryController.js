// src/controllers/categoryController.js
'use strict';

const categoriesService = require('../services/categoriesService');
const postsService = require('../services/postsService');

module.exports = {
  // GET /categories?q=&limit=&offset=&sort=
  async list(req, res, next) {
    try {
      const limit  = Math.min(
        parseInt(req.query.limit || process.env.PAGINATION_LIMIT_DEFAULT || '10', 10),
        parseInt(process.env.PAGINATION_LIMIT_MAX || '100', 10)
      );
      const offset = parseInt(req.query.offset || '0', 10);
      const sort   = req.query.sort || '-id';
      const q      = req.query.q || '';
      const data   = await categoriesService.list({ q, limit, offset, sort });
      res.json(data);
    } catch (e) { next(e); }
  },

  // GET /categories/:id
  async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const cat = await categoriesService.getById(id); // <-- нужен метод в сервисе
      if (!cat) {
        return res.status(404).json({ error: 'Category not found' });
      }
      res.json(cat);
    } catch (e) { next(e); }
  },

  // POST /categories
  async create(req, res, next) {
    try {
      const { title, description } = req.body;
      const cat = await categoriesService.create(req.user, { title, description });
      res.status(201).json(cat);
    } catch (e) { next(e); }
  },

  // PATCH /categories/:id
  async update(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const { title, description } = req.body;
      const cat = await categoriesService.update(req.user, id, { title, description });
      res.json(cat);
    } catch (e) { next(e); }
  },

  // DELETE /categories/:id
  async remove(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const r  = await categoriesService.remove(req.user, id);
      res.json(r); // { ok: true }
    } catch (e) { next(e); }
  },

  // GET /categories/:id/posts
  async getPosts(req, res, next) {
    try {
      const id       = parseInt(req.params.id, 10);

      const defLim   = parseInt(process.env.PAGINATION_LIMIT_DEFAULT || '10', 10);
      const maxLim   = parseInt(process.env.PAGINATION_LIMIT_MAX || '100', 10);
      const limit    = Math.min(parseInt(req.query.limit || String(defLim), 10), maxLim);
      const offset   = parseInt(req.query.offset || '0', 10);

      const sort     = req.query.sort || '-likes'; // дефолт — рейтинг (нетто-лайки)
      const q        = req.query.q || '';
      const author_id= req.query.author_id ? parseInt(req.query.author_id, 10) : undefined;
      const status   = req.query.status ? String(req.query.status) : undefined; // 'active' | 'inactive' (для админа)
      const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
      const dateTo   = req.query.dateTo ? String(req.query.dateTo) : undefined;

      const page = await postsService.list(
        { q, author_id, category: id, status, dateFrom, dateTo, limit, offset, sort },
        { actor: req.user || null }
      );
      res.json(page);
    } catch (e) { next(e); }
  },
};
