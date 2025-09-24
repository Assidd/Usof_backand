// src/services/usersService.js
'use strict';

const { getPool } = require('../config/db');
const usersRepo   = require('../repositories/usersRepo');
const bcrypt      = require('bcrypt');
const env         = require('../config/env');

function Forbidden(msg = 'Forbidden') { const e = new Error(msg); e.name = 'ForbiddenError'; e.status = 403; return e; }
function NotFound(msg = 'Not found')  { const e = new Error(msg); e.name = 'NotFoundError';  e.status = 404; return e; }

// Позволяет передавать как число (userId), так и объект (req.user)
function normalizeUserId(userOrId) {
  return (userOrId && typeof userOrId === 'object') ? userOrId.id : userOrId;
}

function stripSensitive(u) {
  if (!u) return u;
  const clone = { ...u };
  delete clone.password_hash;
  return clone;
}

module.exports = {
  // Текущий пользователь (полный профиль, используется контроллером /me)
  async getMe(userIdOrObj) {
    const userId = normalizeUserId(userIdOrObj);
    const u = await usersRepo.findById(userId);
    if (!u) throw NotFound('User not found');
    return stripSensitive(u);
  },

  // Обновление своего профиля (full_name / profile_picture)
  async updateMe(userIdOrObj, { full_name, profile_picture }) {
    const userId = normalizeUserId(userIdOrObj);
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await usersRepo.updateMeTx(conn, userId, { full_name, profile_picture });
      const u = await usersRepo.findByIdTx(conn, userId);
      await conn.commit();
      if (!u) throw NotFound('User not found');
      return stripSensitive(u);
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // Смена роли (admin-only, проверка — на уровне контроллера/мидлвара)
  async setRole(actor, targetUserId, role) {
    if (actor.role !== 'admin') throw Forbidden('Admin only');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await usersRepo.setRoleTx(conn, targetUserId, role);
      const u = await usersRepo.findByIdTx(conn, targetUserId);
      await conn.commit();
      if (!u) throw NotFound('User not found');
      return stripSensitive(u);
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // Листинг пользователей (проксирование в repo)
  async listUsers({ q, role, limit, offset, sort } = {}) {
    return usersRepo.listUsers({ q, role, limit, offset, sort });
  },

  // ───────────────────────────────────────────────────────────
  // ПУБЛИЧНЫЙ профиль по id (без чувствительных полей)
  async getPublicById(id) {
    const u = await usersRepo.findById(id);
    if (!u) throw NotFound('User not found');
    return stripSensitive(u);
  },

  // Создание пользователя админом (login/email/password/full_name/role)
  async createByAdmin({ login, email, password, full_name, role = 'user' }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // проверки уникальности
      {
        const [r1] = await conn.query('SELECT id FROM users WHERE login = ?', [login]);
        if (r1.length) { const e = new Error('Login already in use'); e.status = 409; throw e; }
        const [r2] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
        if (r2.length) { const e = new Error('Email already in use'); e.status = 409; throw e; }
      }

      const saltRounds   = parseInt(env.PASSWORD_SALT_ROUNDS || '10', 10);
      const password_hash = await bcrypt.hash(password, saltRounds);

      // создаём пользователя
      const created = await usersRepo.createUserTx(conn, {
        login,
        email,
        password_hash,
        full_name: full_name || null,
        role,
      });

      // если createUserTx вернул id — дочитаем сущность
      const userEntity = created && created.id
        ? created
        : await usersRepo.findByIdTx(conn, created?.id || created?.insertId);

      if (!userEntity) throw new Error('Failed to create user');

      await conn.commit();
      return stripSensitive(userEntity);
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // Удаление пользователя админом
  async deleteUser({ id, actor }) {
    if (!actor || actor.role !== 'admin') throw Forbidden('Admin only');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // проверим, что пользователь существует
      const existing = await usersRepo.findByIdTx(conn, id);
      if (!existing) { throw NotFound('User not found'); }

      await usersRepo.deleteUserTx(conn, id);

      await conn.commit();
      return true;
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // ───────────────────────────────────────────────────────────
  // NEW: Универсальный админский апдейт пользователя (PATCH /users/:id)
  async updateByAdmin(actor, targetUserId, patch = {}) {
    if (!actor || actor.role !== 'admin') throw Forbidden('Admin only');

    const { login, email, full_name, profile_picture, role, password } = patch;

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // существует?
      const existing = await usersRepo.findByIdTx(conn, targetUserId);
      if (!existing) throw NotFound('User not found');

      // уникальность логина/почты (если меняем)
      if (typeof login === 'string' && login.length && login !== existing.login) {
        const [r] = await conn.query('SELECT id FROM users WHERE login = ? AND id <> ?', [login, targetUserId]);
        if (r.length) { const e = new Error('Login already in use'); e.status = 409; throw e; }
      }
      if (typeof email === 'string' && email.length && email !== existing.email) {
        const [r] = await conn.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, targetUserId]);
        if (r.length) { const e = new Error('Email already in use'); e.status = 409; throw e; }
      }

      // собираем patch для БД
      const patchDb = {};
      if (login !== undefined)           patchDb.login = login;
      if (email !== undefined)           patchDb.email = email;
      if (full_name !== undefined)       patchDb.full_name = full_name;
      if (profile_picture !== undefined) patchDb.profile_picture = profile_picture;
      if (role !== undefined)            patchDb.role = role;

      // пароль, если пришёл
      if (typeof password === 'string' && password.length) {
        const saltRounds = parseInt(env.PASSWORD_SALT_ROUNDS || '10', 10);
        patchDb.password_hash = await bcrypt.hash(password, saltRounds);
      }

      if (Object.keys(patchDb).length) {
        await usersRepo.updateUserTx(conn, targetUserId, patchDb);
      }

      const updated = await usersRepo.findByIdTx(conn, targetUserId);
      await conn.commit();
      return stripSensitive(updated);
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },

  // NEW: Пересчёт рейтинга пользователя (лайки − дизлайки по постам и комментариям)
  // Используется из likesService после set/remove like.
  async recalcUserRating(userId) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const rating = await usersRepo.computeRatingForUserTx(conn, userId);
      await usersRepo.upsertUserRatingTx(conn, userId, rating);
      await conn.commit();
      return rating;
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }
  },
};
