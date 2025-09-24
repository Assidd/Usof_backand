'use strict';

/**
 * Инициализация БД без ORM:
 *  - CREATE DATABASE IF NOT EXISTS
 *  - выполнение src/db/init.sql (drop/create/seed)
 *  - sanity-check по ключевым таблицам
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../config/env');
const { getPool } = require('../config/db');

async function ensureDatabase() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      multipleStatements: true,
    });

    const createSql = `
      CREATE DATABASE IF NOT EXISTS \`${db.database}\`
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_0900_ai_ci
    `;
    await conn.query(createSql);
    console.log(`[db:init] ensured database "${db.database}"`);
  } finally {
    if (conn) await conn.end();
  }
}

async function applyInitSql() {
  const sqlPath = path.join(__dirname, 'init.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`[db:init] init.sql not found at ${sqlPath}`);
  }
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  let conn;
  try {
    conn = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      multipleStatements: true,
    });
    await conn.query("SET NAMES utf8mb4");
    await conn.query("SET time_zone = '+00:00'");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query(fullSql);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log('[db:init] schema + seeds applied from init.sql');
  } finally {
    if (conn) await conn.end();
  }
}

async function sanityCheck() {
  const pool = getPool();
  const targets = [
    ['users', 5],
    ['categories', 5],
    ['posts', 5],
    ['posts_categories', 5],
    ['comments', 5],
    ['likes', 5],
    ['email_tokens', 5],
    ['reset_tokens', 5],
  ];

  for (const [table, min] of targets) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
      const count = rows?.[0]?.c ?? 0;
      const tag = count < min ? 'warn' : 'ok';
      console.log(`[db:check][${tag}] ${table}: ${count} rows${count < min ? ` (< ${min})` : ''}`);
    } catch (e) {
      console.log(`[db:check][skip] ${table}: ${e.message}`);
    }
  }
}

/** Главная функция инициализации (экспорт) */
async function initDatabase() {
  // предохранитель для prod
  if (
    String(process.env.NODE_ENV).toLowerCase() === 'production' &&
    String(process.env.INIT_DB).toLowerCase() !== 'true'
  ) {
    console.log('[db:init] skipped in production (set INIT_DB=true to force)');
    return;
  }

  await ensureDatabase();
  await applyInitSql();

  // проверим, что общий пул коннектится
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('[db:init] app pool connection OK');

  await sanityCheck();
}

// экспорт и как default, и как именованный — чтобы любой импорт сработал
module.exports = initDatabase;
module.exports.initDatabase = initDatabase;
module.exports.init = initDatabase;
