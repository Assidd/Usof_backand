// src/services/categoriesService.js
'use strict';

const { getPool } = require('../config/db');
const categoriesRepo = require('../repositories/categoriesRepo');

function NotFound(msg = 'Not found') { const e = new Error(msg); e.name = 'NotFoundError'; e.status = 404; return e; }

const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT) || 10;
const MAX = Number(process.env.PAGINATION_LIMIT_MAX) || 100;

function clampInt(value, def, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : def;
  return Math.min(Math.max(v, min), max);
}

module.exports = {
  async list({ q, limit, offset, sort } = {}) {
    // подстрахуем значения ещё и на уровне сервиса
    const safeLimit = clampInt(limit, DEF, 1, MAX);
    const safeOffset = clampInt(offset, 0, 0, Number.MAX_SAFE_INTEGER);
    return categoriesRepo.listCategories({ q, limit: safeLimit, offset: safeOffset, sort });
  },

  // получить категорию по id (публично)
  async getById(id) {
    const nid = Number(id);
    if (!Number.isInteger(nid) || nid < 1) return null;
    return categoriesRepo.findById(nid);
  },

  async create(actor, { title, description }) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const id = await categoriesRepo.createCategoryTx(conn, { title, description });
      const cat = await categoriesRepo.findByIdTx(conn, id);
      await conn.commit();
      return cat;
    } catch (e) {
      await conn.rollback(); throw e;
    } finally { conn.release(); }
  },

  async update(actor, id, { title, description }) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await categoriesRepo.updateCategoryTx(conn, id, { title, description });
      const cat = await categoriesRepo.findByIdTx(conn, id);
      if (!cat) throw NotFound('Category not found');
      await conn.commit();
      return cat;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },

  async remove(actor, id) {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await categoriesRepo.deleteCategoryTx(conn, id);
      await conn.commit();
      return { ok: true };
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },
};
