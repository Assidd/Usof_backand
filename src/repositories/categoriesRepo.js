// src/repositories/categoriesRepo.js
'use strict';

const { getPool } = require('../config/db');

function clampInt(value, def, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : def;
  const i = Math.trunc(v);
  return Math.min(Math.max(i, min), max);
}

function buildOrder(sort, allowed = ['id', 'title']) {
  if (!sort) return 'title ASC';
  const desc = String(sort).startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort);
  const safe = allowed.includes(field) ? field : 'title';
  return `${safe} ${desc ? 'DESC' : 'ASC'}`;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, title, description
     FROM categories
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findByIdTx(conn, id) {
  const [rows] = await conn.execute(
    `SELECT id, title, description
     FROM categories
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createCategoryTx(conn, { title, description }) {
  const [res] = await conn.execute(
    `INSERT INTO categories (title, description)
     VALUES (?, ?)`,
    [title, description ?? null]
  );
  return res.insertId;
}

async function updateCategoryTx(conn, id, { title, description }) {
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (!fields.length) return 0;

  params.push(id);
  const [res] = await conn.execute(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows;
}

async function deleteCategoryTx(conn, id) {
  const [res] = await conn.execute(
    `DELETE FROM categories WHERE id = ?`,
    [id]
  );
  return res.affectedRows;
}

/**
 * Список категорий с поиском/сортировкой/пагинацией.
 * ВАЖНО: LIMIT/OFFSET подставляем как ЧИСЛА (без плэйсхолдеров),
 * чтобы избежать "Incorrect arguments to mysqld_stmt_execute".
 */
async function listCategories({ q, limit, offset, sort } = {}) {
  const pool = getPool();

  const DEF = Number(process.env.PAGINATION_LIMIT_DEFAULT) || 10;
  const MAX = Number(process.env.PAGINATION_LIMIT_MAX) || 100;
  const safeLimit  = clampInt(limit,  DEF, 1, MAX);
  const safeOffset = clampInt(offset, 0,   0, Number.MAX_SAFE_INTEGER);

  const whereParts = [];
  const params = [];

  if (q) {
    whereParts.push('(title LIKE ? OR description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const order = buildOrder(sort, ['id', 'title']);

  // Данные
  const sql = `
    SELECT id, title, description
    FROM categories
    ${where}
    ORDER BY ${order}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [rows] = await pool.query(sql, params);

  // Total
  const countSql = `SELECT COUNT(*) AS c FROM categories ${where}`;
  const [[{ c }]] = await pool.query(countSql, params);

  return { items: rows, total: c, limit: safeLimit, offset: safeOffset };
}

module.exports = {
  // pool
  findById,
  listCategories,
  // tx
  findByIdTx,
  createCategoryTx,
  updateCategoryTx,
  deleteCategoryTx,
};
