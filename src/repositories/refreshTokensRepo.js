'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');

// Хешим любой входной токен
function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

async function createTx(conn, { user_id, token_plain, jti, expires_at }) {
  const token_hash = sha256(token_plain);
  await conn.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, jti, expires_at) VALUES (?, ?, ?, ?)`,
    [user_id, token_hash, jti, expires_at]
  );
  return { token_hash };
}

async function findActiveByToken(token_plain) {
  const pool = getPool();
  const token_hash = sha256(token_plain);
  const [rows] = await pool.execute(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [token_hash]
  );
  return rows[0] || null;
}

async function revokeByIdTx(conn, id) {
  await conn.execute(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`, [id]);
}

async function revokeByUserTx(conn, user_id) {
  await conn.execute(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [user_id]);
}

async function purgeExpired() {
  const pool = getPool();
  await pool.execute(`DELETE FROM refresh_tokens WHERE expires_at <= NOW() OR revoked_at IS NOT NULL`);
}

module.exports = {
  sha256,
  createTx,
  findActiveByToken,
  revokeByIdTx,
  revokeByUserTx,
  purgeExpired,
};
