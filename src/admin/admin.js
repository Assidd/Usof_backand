'use strict';

/**
 * Минимальная админ-панель на /admin
 * + Управление lock для постов и комментариев
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const env = require('../config/env');
const adminMiddleware = require('../middleware/adminMiddleware');
const authService = require('../services/authService');
const { h, layout } = require('./resources');

// Сервисы/репозитории
const usersRepo = require('../repositories/usersRepo');
const categoriesService = require('../services/categoriesService');
const postsService = require('../services/postsService');
const commentsService = require('../services/commentsService');
const postsRepo = require('../repositories/postsRepo');
const categoriesRepo = require('../repositories/categoriesRepo');
const commentsRepo = require('../repositories/commentsRepo');

function parseCsvIds(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  return String(v)
    .split(',')
    .map(s => Number(s.trim()))
    .filter(Number.isFinite);
}

function adminRouter() {
  const router = express.Router();

  // формы
  router.use(express.urlencoded({ extended: true }));
  // cookie для хранимого accessToken
  router.use(cookieParser());

  // если в cookie есть adminToken — подсовываем в headers для middleware
  router.use((req, _res, next) => {
    const t = req.cookies?.adminToken;
    if (t && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${t}`;
    }
    next();
  });

  // ───────────── страницы логина/логаута ─────────────
  router.get('/login', (req, res) => {
    const err = req.query.err ? `<p style="color:#c00">${h(req.query.err)}</p>` : '';
    res.send(
      layout('Admin Login', `
        <h1>Admin Login</h1>
        ${err}
        <form method="post" action="/admin/login" style="display:grid;gap:8px;max-width:360px">
          <label>Email (или логин)<br><input type="text" name="identifier" required></label>
          <label>Password<br><input type="password" name="password" required></label>
          <button type="submit">Sign in</button>
        </form>
      `)
    );
  });

  router.post('/login', async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const { accessToken, user } = await authService.login({ identifier, password });
      if (!user || user.role !== 'admin') {
        return res.redirect('/admin/login?err=Admin+only');
      }
      res.cookie('adminToken', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * (Number(env.JWT_EXPIRES_HOURS || 10)),
      });
      res.redirect('/admin');
    } catch (_e) {
      res.redirect('/admin/login?err=Invalid+credentials');
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.redirect('/admin/login');
  });

  // с этого места — только авторизованный админ
  router.use(adminMiddleware);

  // ───────────── dashboard ─────────────
  router.get('/', async (req, res, next) => {
    try {
      const [posts] = await require('../config/db').getPool().query('SELECT COUNT(*) c FROM posts');
      const [comments] = await require('../config/db').getPool().query('SELECT COUNT(*) c FROM comments');
      const [users] = await require('../config/db').getPool().query('SELECT COUNT(*) c FROM users');
      const [cats] = await require('../config/db').getPool().query('SELECT COUNT(*) c FROM categories');

      res.send(layout('Admin', `
        <h1>Admin dashboard</h1>
        <form method="post" action="/admin/logout" style="margin:10px 0"><button>Logout</button></form>
        <div class="cards">
          <a class="card" href="/admin/users"><b>Users</b><span>${users[0].c}</span></a>
          <a class="card" href="/admin/categories"><b>Categories</b><span>${cats[0].c}</span></a>
          <a class="card" href="/admin/posts"><b>Posts</b><span>${posts[0].c}</span></a>
          <a class="card" href="/admin/comments"><b>Comments</b><span>${comments[0].c}</span></a>
        </div>
      `));
    } catch (e) { next(e); }
  });

  // ───────────── Users: смена роли ─────────────
  router.get('/users', async (req, res, next) => {
    try {
      const data = await usersRepo.listUsers({ limit: 50, offset: 0, sort: 'id' });
      const rows = data.items.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${h(u.login)}</td>
          <td>${h(u.email)}</td>
          <td>${h(u.role)}</td>
          <td>${u.email_confirmed ? '✅' : '❌'}</td>
          <td>
            <form method="post" action="/admin/users/${u.id}/role" style="display:flex;gap:4px">
              <select name="role">
                <option value="user" ${u.role==='user'?'selected':''}>user</option>
                <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
              </select>
              <button>Save</button>
            </form>
          </td>
        </tr>
      `).join('');
      res.send(layout('Users', `
        <h1>Users</h1>
        <table class="tbl">
          <thead><tr><th>ID</th><th>Login</th><th>Email</th><th>Role</th><th>Email OK</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `));
    } catch (e) { next(e); }
  });

  router.post('/users/:id/role', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { role } = req.body;
      await require('../services/usersService').setRole(req.user, id, role);
      res.redirect('/admin/users');
    } catch (e) { next(e); }
  });

  // ───────────── Categories: CRUD ─────────────
  router.get('/categories', async (req, res, next) => {
    try {
      const data = await categoriesRepo.listCategories({ limit: 100, offset: 0, sort: 'id' });
      const items = data.items.map(c => `
        <tr>
          <td>${c.id}</td>
          <td>${h(c.title)}</td>
          <td>${h(c.description||'')}</td>
          <td>
            <form method="post" action="/admin/categories/${c.id}/edit" style="display:flex;gap:4px">
              <input name="title" value="${h(c.title)}" required>
              <input name="description" value="${h(c.description||'')}">
              <button>Save</button>
            </form>
          </td>
          <td>
            <form method="post" action="/admin/categories/${c.id}/delete" onsubmit="return confirm('Delete category #${c.id}?')">
              <button>Delete</button>
            </form>
          </td>
        </tr>
      `).join('');
      res.send(layout('Categories', `
        <h1>Categories</h1>
        <form method="post" action="/admin/categories/create" style="display:flex;gap:6px;margin:10px 0">
          <input name="title" placeholder="Title" required>
          <input name="description" placeholder="Description">
          <button>Create</button>
        </form>
        <table class="tbl">
          <thead><tr><th>ID</th><th>Title</th><th>Description</th><th>Edit</th><th>Delete</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
      `));
    } catch (e) { next(e); }
  });

  router.post('/categories/create', async (req, res, next) => {
    try {
      const { title, description } = req.body;
      await categoriesService.create(req.user, { title, description });
      res.redirect('/admin/categories');
    } catch (e) { next(e); }
  });

  router.post('/categories/:id/edit', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { title, description } = req.body;
      await categoriesService.update(req.user, id, { title, description });
      res.redirect('/admin/categories');
    } catch (e) { next(e); }
  });

  router.post('/categories/:id/delete', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await categoriesService.remove(req.user, id);
      res.redirect('/admin/categories');
    } catch (e) { next(e); }
  });

  // ───────────── Posts: статус + категории + LOCK ─────────────
  router.get('/posts', async (req, res, next) => {
    try {
      const list = await postsService.list(
        { limit: 50, offset: 0, sort: '-publish_date', status: req.query.status || undefined },
        { actor: req.user }
      );
      const allCats = (await categoriesRepo.listCategories({ limit: 100, offset: 0, sort: 'id' })).items;

      const rows = list.items.map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${h(p.title)}</td>
          <td>${h(p.author_login||('user#'+p.author_id))}</td>
          <td>${h(p.status)}</td>
          <td>${h(String(p.likes_count||0))}/${h(String(p.dislikes_count||0))}</td>
          <td>${p.locked ? '🔒' : '—'}</td>
          <td>
            <form method="post" action="/admin/posts/${p.id}/status" style="display:flex;gap:4px">
              <select name="status">
                <option value="active" ${p.status==='active'?'selected':''}>active</option>
                <option value="inactive" ${p.status==='inactive'?'selected':''}>inactive</option>
              </select>
              <button>Save</button>
            </form>
          </td>
          <td>
            <form method="post" action="/admin/posts/${p.id}/categories" style="display:flex;gap:4px">
              <input name="categories" placeholder="csv ids, напр. 1,2"
                     value="" title="IDs через запятую">
              <button>Replace</button>
            </form>
          </td>
          <td>
            <form method="post" action="/admin/posts/${p.id}/lock" style="display:flex;gap:4px">
              <select name="locked">
                <option value="false" ${!p.locked?'selected':''}>unlock</option>
                <option value="true"  ${p.locked?'selected':''}>lock</option>
              </select>
              <button>Apply</button>
            </form>
          </td>
        </tr>
      `).join('');

      res.send(layout('Posts', `
        <h1>Posts</h1>
        <p>Редактируем только <b>status</b> и <b>categories</b>. Контент менять нельзя (по ТЗ). Lock блокирует изменения не-админами и комментирование.</p>
        <table class="tbl">
          <thead>
            <tr>
              <th>ID</th><th>Title</th><th>Author</th><th>Status</th><th>Likes/Dis</th><th>Lock</th>
              <th>Set status</th><th>Replace categories</th><th>Toggle lock</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <details style="margin-top:10px">
          <summary>Справочник категорий</summary>
          <ul>${allCats.map(c=>`<li>#${c.id} — ${h(c.title)}</li>`).join('')}</ul>
        </details>
      `));
    } catch (e) { next(e); }
  });

  router.post('/posts/:id/status', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      await postsService.update(req.user, id, { status });
      res.redirect('/admin/posts');
    } catch (e) { next(e); }
  });

  router.post('/posts/:id/categories', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const categoryIds = parseCsvIds(req.body.categories);
      await postsService.update(req.user, id, { categoryIds });
      res.redirect('/admin/posts');
    } catch (e) { next(e); }
  });

  // NEW: lock/unlock поста
  router.post('/posts/:id/lock', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const locked = String(req.body.locked) === 'true';
      await postsService.setLock(req.user, id, locked);
      res.redirect('/admin/posts');
    } catch (e) { next(e); }
  });

  // ───────────── Comments: статус + LOCK ─────────────
  router.get('/comments', async (req, res, next) => {
    try {
      // последние 50 по id
      let items;
      // если есть общий листинг — попробуем через прямой запрос (как и было)
      const pool = require('../config/db').getPool();
      const [rows] = await pool.query(`
        SELECT c.id, c.post_id, c.author_id, c.content, c.status, c.publish_date,
               c.locked AS locked,
               u.login AS author_login
        FROM comments c
        JOIN users u ON u.id = c.author_id
        ORDER BY c.id DESC
        LIMIT 50
      `);
      items = rows;

      const rowsHtml = items.map(c => `
        <tr>
          <td>${c.id}</td>
          <td>#${c.post_id}</td>
          <td>${h(c.author_login || ('user#'+c.author_id))}</td>
          <td>${h(c.status)}</td>
          <td>${c.locked ? '🔒' : '—'}</td>
          <td style="max-width:380px;overflow:hidden;text-overflow:ellipsis">${h(c.content)}</td>
          <td>
            <form method="post" action="/admin/comments/${c.id}/status" style="display:flex;gap:4px">
              <select name="status">
                <option value="active" ${c.status==='active'?'selected':''}>active</option>
                <option value="inactive" ${c.status==='inactive'?'selected':''}>inactive</option>
              </select>
              <button>Save</button>
            </form>
          </td>
          <td>
            <form method="post" action="/admin/comments/${c.id}/lock" style="display:flex;gap:4px">
              <select name="locked">
                <option value="false" ${!c.locked?'selected':''}>unlock</option>
                <option value="true"  ${c.locked?'selected':''}>lock</option>
              </select>
              <button>Apply</button>
            </form>
          </td>
        </tr>
      `).join('');

      res.send(layout('Comments', `
        <h1>Comments</h1>
        <table class="tbl">
          <thead><tr><th>ID</th><th>Post</th><th>Author</th><th>Status</th><th>Lock</th><th>Content</th><th>Set status</th><th>Toggle lock</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `));
    } catch (e) { next(e); }
  });

  router.post('/comments/:id/status', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      await commentsService.update(req.user, id, { status });
      res.redirect('/admin/comments');
    } catch (e) { next(e); }
  });

  // NEW: lock/unlock комментария
  router.post('/comments/:id/lock', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const locked = String(req.body.locked) === 'true';
      await commentsService.setLock(req.user, id, locked);
      res.redirect('/admin/comments');
    } catch (e) { next(e); }
  });

  return router;
}

function mountAdminPanel(app) {
  app.use('/admin', adminRouter());
}

module.exports = { mountAdminPanel };
