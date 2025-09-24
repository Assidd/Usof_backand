// src/controllers/userController.js
'use strict';

const bcrypt       = require('bcrypt');
const usersService = require('../services/usersService');
const usersRepo    = require('../repositories/usersRepo');
const env          = require('../config/env');

// строим публичный URL для файлов из /uploads
function toPublicUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath; // уже абсолютный
  const base = (env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  // берём только имя файла, чтобы не задвоить /uploads
  const file = String(storedPath).split('/').slice(-1)[0];
  return `${base}/uploads/${file}`;
}

// единообразное представление пользователя наружу
function shapeUser(u, { includeEmail = false } = {}) {
  if (!u) return null;
  return {
    id: u.id,
    login: u.login,
    ...(includeEmail ? { email: u.email } : {}),
    full_name: u.full_name || null,
    profile_picture: u.profile_picture ? toPublicUrl(u.profile_picture) : null,
    rating: typeof u.rating !== 'undefined' ? u.rating : null,
    role: u.role,
    email_confirmed: !!u.email_confirmed,
    created_at: u.created_at,
  };
}

module.exports = {
  // GET /users/me
  async getMe(req, res, next) {
    try {
      const me = await usersRepo.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      res.json(shapeUser(me, { includeEmail: true }));
    } catch (e) { next(e); }
  },

  // PATCH /users/me
  async updateMe(req, res, next) {
    try {
      const { full_name, profile_picture } = req.body;
      const updated = await usersService.updateMe(req.user, { full_name, profile_picture });
      res.json(shapeUser(updated, { includeEmail: true }));
    } catch (e) { next(e); }
  },

  // POST /users/me/avatar  (multipart/form-data)
  async uploadAvatar(req, res, next) {
    try {
      if (!req.file) {
        const err = new Error('avatar file is required');
        err.status = 400; throw err;
      }
      const filename   = req.file.filename;         // имя файла в /uploads
      const storedPath = `uploads/${filename}`;     // что кладём в БД

      const updated = await usersService.updateMe(req.user, { profile_picture: storedPath });

      res.status(201).json({
        ok: true,
        path: storedPath,
        url: toPublicUrl(storedPath),
        user: shapeUser(updated, { includeEmail: true }),
      });
    } catch (e) { next(e); }
  },

  // GET /users  ?q=&role=&limit=&offset=&sort=
  async list(req, res, next) {
    try {
      const limit   = Math.min(
        parseInt(req.query.limit  || process.env.PAGINATION_LIMIT_DEFAULT || '10', 10),
        parseInt(process.env.PAGINATION_LIMIT_MAX || '100', 10)
      );
      const offset  = parseInt(req.query.offset || '0', 10);
      const sort    = req.query.sort || '-rating,-created_at';
      const q       = req.query.q || '';
      const role    = req.query.role || undefined;

      const page = await usersRepo.listUsers({ q, role, limit, offset, sort });
      page.items = page.items.map(u => shapeUser(u, { includeEmail: false }));
      res.json(page);
    } catch (e) { next(e); }
  },

  // PATCH /users/:id/role  { role }
  async setRole(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const { role } = req.body;

      const updated = await (usersService.setRole
        ? usersService.setRole(req.user, id, role)
        : (async () => {
            const pool = require('../config/db').getPool();
            const conn = await pool.getConnection();
            try {
              await conn.beginTransaction();
              await usersRepo.setRoleTx(conn, id, role);
              const u = await (usersRepo.findByIdTx ? usersRepo.findByIdTx(conn, id) : usersRepo.findById(id));
              await conn.commit();
              return u;
            } catch (err) { await conn.rollback(); throw err; }
            finally { conn.release(); }
          })()
      );

      res.json(shapeUser(updated, { includeEmail: true }));
    } catch (e) { next(e); }
  },

  // GET /users/:id  (публичный профиль)
  async getById(req, res, next) {
    try {
      const id = Number(req.params.id);
      const u = await (usersService.getPublicById
        ? usersService.getPublicById(id)
        : usersRepo.findById(id)
      );
      if (!u) return res.status(404).json({ message: 'User not found' });

      // показываем email только себе или админу
      const includeEmail = !!(req.user && (req.user.id === id || req.user.role === 'admin'));
      res.json(shapeUser(u, { includeEmail }));
    } catch (e) { next(e); }
  },

  // NEW: PATCH /users/:id  (admin) — общий апдейт пользователя
  async updateByAdmin(req, res, next) {
    try {
      const id = Number(req.params.id);
      const {
        login,
        email,
        full_name,
        profile_picture,
        role,
        password, // если передан — сменим пароль
      } = req.body;

      const patch = { login, email, full_name, profile_picture, role, password };
      const updated = await usersService.updateByAdmin(req.user, id, patch);
      res.json(shapeUser(updated, { includeEmail: true }));
    } catch (e) { next(e); }
  },

  // POST /users  (admin-only)
  async createByAdmin(req, res, next) {
    try {
      const { login, email, password, full_name, role } = req.body;

      const created = await (usersService.createByAdmin
        ? usersService.createByAdmin({ login, email, password, full_name, role })
        : (async () => {
            const db = require('../config/db');
            const pool = db.getPool ? db.getPool() : null;
            const conn = pool ? await pool.getConnection() : null;

            const hash = await bcrypt.hash(password, env.PASSWORD_SALT_ROUNDS || 10);

            try {
              if (conn) await conn.beginTransaction();

              // проверки уникальности (через conn, если он есть)
              const existsByLogin = await usersRepo.findByLogin(conn || usersRepo, login);
              if (existsByLogin) { const err = new Error('Login already in use'); err.status = 409; throw err; }

              const existsByEmail = await usersRepo.findByEmail(conn || usersRepo, email);
              if (existsByEmail) { const err = new Error('Email already in use'); err.status = 409; throw err; }

              const createdUser = conn && usersRepo.createUserTx
                ? await usersRepo.createUserTx(conn, {
                    login, email, password_hash: hash,
                    full_name: full_name || null,
                    role: role || 'user',
                  })
                : await (async () => {
                    // fallback без Tx (не желателен, но рабочий)
                    const [resInsert] = await (require('../config/db').getPool()).query(
                      'INSERT INTO users (login, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
                      [login, email, hash, full_name || null, role || 'user']
                    );
                    return await usersRepo.findById(resInsert.insertId);
                  })();

              if (conn) { await conn.commit(); conn.release(); }

              return createdUser;
            } catch (err) {
              if (conn) { await conn.rollback(); conn.release(); }
              throw err;
            }
          })()
      );

      res.status(201).json(shapeUser(created, { includeEmail: true }));
    } catch (e) { next(e); }
  },

  // DELETE /users/:id  (admin-only)
  async remove(req, res, next) {
    try {
      const id = Number(req.params.id);

      await (usersService.deleteUser
        ? usersService.deleteUser({ id, actor: req.user })
        : (async () => {
            const db = require('../config/db');
            const pool = db.getPool ? db.getPool() : null;
            const conn = pool ? await pool.getConnection() : null;

            try {
              if (conn) await conn.beginTransaction();

              if (usersRepo.deleteUserTx && conn) {
                await usersRepo.deleteUserTx(conn, id);
              } else {
                // жёсткий fallback — может бросить 1451 (FK), твой errorHandler мапит это в 409
                await (require('../config/db').getPool()).query('DELETE FROM users WHERE id = ?', [id]);
              }

              if (conn) { await conn.commit(); conn.release(); }
            } catch (err) {
              if (conn) { await conn.rollback(); conn.release(); }
              throw err;
            }
          })()
      );

      res.status(204).send();
    } catch (e) { next(e); }
  },
};
