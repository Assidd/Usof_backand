// src/services/authService.js
'use strict';

const crypto = require('crypto');

const jwt = require('../utils/jwt'); // signJwt(payload, { expiresIn, jti })
const env = require('../config/env');
const { getPool } = require('../config/db');

const usersRepo  = require('../repositories/usersRepo');
const tokensRepo = require('../repositories/tokensRepo'); // для ревокации access по jti
const refreshRepo = require('../repositories/refreshTokensRepo'); // новый репозиторий (hash-based)

const { hashPassword, verifyPassword } = require('../utils/passwords');
const mail = require('./mailerService'); // sendVerifyEmail/sendResetEmail

const MAIL_ENABLED = String(process.env.MAIL_ENABLED).toLowerCase() === 'true';
const BLOCK_UNVERIFIED_LOGIN = String(process.env.BLOCK_UNVERIFIED_LOGIN ?? 'true').toLowerCase() === 'true';

const EMAIL_TOKEN_TTL_DAYS = 7;
const ACCESS_TOKEN_TTL = env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(env.REFRESH_TOKEN_TTL_DAYS || 30);

// ───────────────────────────────────────────────────────────
// Errors
function Unauthorized(msg = 'Unauthorized') { const e = new Error(msg); e.name = 'UnauthorizedError'; e.status = 401; return e; }
function BadRequest(msg = 'Bad request')     { const e = new Error(msg); e.name = 'BadRequestError'; e.status = 400; return e; }
function Conflict(msg = 'Conflict')           { const e = new Error(msg); e.name = 'ConflictError'; e.status = 409; return e; }
function NotFound(msg = 'Not found')          { const e = new Error(msg); e.name = 'NotFoundError'; e.status = 404; return e; }

// ───────────────────────────────────────────────────────────
// Helpers
function newJti() {
  return (jwt.newJti && typeof jwt.newJti === 'function')
    ? jwt.newJti()
    : (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
}

function datePlusDays(days) {
  const d = new Date(); d.setDate(d.getDate() + Number(days || 0)); return d;
}

async function issueAccessTokenFor(user) {
  const jti = newJti();
  const token = await jwt.signJwt({
    sub: String(user.id),
    role: user.role,
    email_confirmed: !!user.email_confirmed,
  }, { expiresIn: ACCESS_TOKEN_TTL, jti });
  return { token, jti };
}

async function issueRefreshTokenTx(conn, { user_id, jti }) {
  const plain = crypto.randomBytes(32).toString('hex');        // то, что уходит клиенту
  const expires_at = datePlusDays(REFRESH_TOKEN_TTL_DAYS);     // дата истечения в БД
  await refreshRepo.createTx(conn, { user_id, token_plain: plain, jti, expires_at });
  return { refreshToken: plain, expires_at };
}

// ───────────────────────────────────────────────────────────
// Service
module.exports = {
  /** Register user */
  async register({ login, email, password, full_name }) {
    const pool = getPool();
    const existing = await usersRepo.findByLoginOrEmail(login, email);
    if (existing) throw Conflict('User with same login/email already exists');

    const password_hash = await hashPassword(password);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const userId = await usersRepo.createUserTx(conn, { login, email, password_hash, full_name });

      // email verify token (7d)
      const token = await usersRepo.createEmailTokenTx(conn, { user_id: userId, ttlDays: EMAIL_TOKEN_TTL_DAYS });

      await conn.commit();

      if (MAIL_ENABLED) {
        try { await mail.sendVerifyEmail(email, token); }
        catch (err) { console.error('[mail] verify send failed:', err.message); }
      }

      const dev = process.env.NODE_ENV !== 'production';
      return dev && !MAIL_ENABLED
        ? { id: userId, login, email, full_name, email_token: token }
        : { id: userId, login, email, full_name };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /** Login → access + refresh (rotation-ready) */
  async login({ identifier, password }) {
    const user = await usersRepo.findByLoginOrEmail(identifier, identifier);
    if (!user) throw Unauthorized('Invalid credentials');

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw Unauthorized('Invalid credentials');

    if (BLOCK_UNVERIFIED_LOGIN && !user.email_confirmed) {
      throw Unauthorized('Email not confirmed');
    }

    // выдаём access + refresh в одной транзакции
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const { token, jti } = await issueAccessTokenFor(user);
      const { refreshToken } = await issueRefreshTokenTx(conn, { user_id: user.id, jti });

      await conn.commit();

      // для совместимости: и token, и accessToken
      return {
        token,
        accessToken: token,
        refreshToken,
        user: {
          id: user.id,
          login: user.login,
          email: user.email,
          role: user.role,
          email_confirmed: !!user.email_confirmed,
        },
      };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /**
   * Resend verification mail
   * - Не раскрываем существование пользователя (всегда { ok: true })
   * - Если найден и не подтверждён — создаём новый email-токен и отправляем письмо
   * - В dev при MAIL_ENABLED=false возвращаем токен для ручного теста
   */
  async resendVerification(email) {
    const pool = getPool();
    const user = await usersRepo.findByLoginOrEmail(null, email);
    if (!user) return { ok: true };
    if (user.email_confirmed) return { ok: true };

    const conn = await pool.getConnection();
    let token;
    try {
      await conn.beginTransaction();
      token = await usersRepo.createEmailTokenTx(conn, { user_id: user.id, ttlDays: EMAIL_TOKEN_TTL_DAYS });
      await conn.commit();
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }

    if (MAIL_ENABLED) {
      try { await mail.sendVerifyEmail(email, token); }
      catch (err) { console.error('[mail] verify resend failed:', err.message); }
    }

    const dev = process.env.NODE_ENV !== 'production';
    return dev && !MAIL_ENABLED ? { ok: true, email_token: token } : { ok: true };
  },

  /** Email verify by token */
  async verifyEmail(token) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const t = await usersRepo.findEmailTokenTx(conn, token);
      if (!t) throw NotFound('Invalid token');
      if (new Date(t.expires_at) < new Date()) throw BadRequest('Token expired');

      await usersRepo.markEmailConfirmedTx(conn, t.user_id);
      await usersRepo.deleteEmailTokenTx(conn, t.id);

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /** Request password reset */
  async requestPasswordReset(email) {
    const pool = getPool();
    const user = await usersRepo.findByLoginOrEmail(null, email);
    if (!user) return { ok: true }; // не палим существование

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const token = await usersRepo.createResetTokenTx(conn, { user_id: user.id, ttlDays: 1 });

      await conn.commit();

      if (MAIL_ENABLED) {
        try { if (mail.sendResetEmail) await mail.sendResetEmail(email, token); }
        catch (err) { console.error('[mail] reset send failed:', err.message); }
      }

      const dev = process.env.NODE_ENV !== 'production';
      return dev && !MAIL_ENABLED ? { ok: true, reset_token: token } : { ok: true };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /** Reset password by token */
  async resetPassword({ token, newPassword }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const t = await usersRepo.findResetTokenTx(conn, token);
      if (!t) throw NotFound('Invalid token');
      if (new Date(t.expires_at) < new Date()) throw BadRequest('Token expired');

      const password_hash = await hashPassword(newPassword);
      await usersRepo.updatePasswordTx(conn, t.user_id, password_hash);
      await usersRepo.deleteResetTokenTx(conn, t.id);

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /** Exchange refresh → new access + rotated refresh */
  async refresh({ refreshToken }) {
    // 1) найдём действующий refresh (по hash) — нераскрывающий поиск
    const existing = await refreshRepo.findActiveByToken(refreshToken);
    if (!existing) { const e = new Error('Invalid or expired refresh token'); e.status = 401; throw e; }

    // 2) подтянем пользователя
    const user = await usersRepo.findById(existing.user_id);
    if (!user) { const e = new Error('User not found'); e.status = 404; throw e; }

    // 3) ротация в транзакции: отозвать старый, выдать новый access+refresh
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await refreshRepo.revokeByIdTx(conn, existing.id);

      const { token, jti } = await issueAccessTokenFor(user);
      const { refreshToken: newRefresh } = await issueRefreshTokenTx(conn, { user_id: user.id, jti });

      await conn.commit();
      return { token, accessToken: token, refreshToken: newRefresh };
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  /**
   * Logout:
   *  - ревокация access (через revoked_tokens) по jti/exp
   *  - опционально отзываем конкретный refresh ИЛИ все refresh'и пользователя
   *    (передай refreshToken в body или вызывай без него, чтобы отозвать все)
   * Требует: middleware кладёт в req.tokenMeta → { jti, exp } и req.user
   */
  async logout({ jti, exp, userId, refreshToken }) {
    // access (если jti есть)
    if (jti && exp) {
      await tokensRepo.revokeToken({ jti, exp });
    }

    // refresh — по желанию
    if (userId) {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        if (refreshToken) {
          const found = await refreshRepo.findActiveByToken(refreshToken);
          if (found && found.user_id === userId) {
            await refreshRepo.revokeByIdTx(conn, found.id);
          }
        } else {
          // отозвать все активные refresh данного пользователя
          await refreshRepo.revokeByUserTx(conn, userId);
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback(); throw e;
      } finally {
        conn.release();
      }
    }

    return { ok: true };
  },
};
