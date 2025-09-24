'use strict';

const { getPool } = require('../config/db');

function toDateFromExpSeconds(exp) {
  // exp приходит в секундах (JWT), MySQL ждёт DATETIME
  const ms = Number(exp) * 1000;
  return new Date(ms);
}

async function revokeToken({ jti, exp }) {
  const pool = getPool();
  const dt = toDateFromExpSeconds(exp || (Date.now()/1000 + 60)); // запас, если exp нет
  // idempotent: если уже есть — не падаем
  await pool.execute(
    `INSERT IGNORE INTO revoked_tokens (jti, exp) VALUES (?, ?)`,
    [String(jti), dt]
  );
  return { ok: true };
}

async function isRevoked(jti) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT jti FROM revoked_tokens WHERE jti = ? LIMIT 1`,
    [String(jti)]
  );
  return !!rows[0];
}

// можно вызывать по крону/при старте
async function purgeExpired() {
  const pool = getPool();
  await pool.execute(`DELETE FROM revoked_tokens WHERE exp < NOW()`);
}

module.exports = { revokeToken, isRevoked, purgeExpired };
