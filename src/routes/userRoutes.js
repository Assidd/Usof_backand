// src/routes/userRoutes.js
'use strict';

const { Router } = require('express');
const validate = require('../middleware/validate');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/userController');

const r = Router();

// мой профиль
r.get('/me', auth, ctrl.getMe);

r.patch(
  '/me',
  auth,
  validate({
    body: {
      full_name:       { type: 'string', max: 128 },
      password:        { type: 'string', min: 6, max: 128 },
      profile_picture: { type: 'string' },
    },
  }),
  ctrl.updateMe
);

// (существующий) загрузка аватара (multipart/form-data, поле "avatar")
r.post('/me/avatar', auth, upload.singleImage('avatar'), ctrl.uploadAvatar);

// (НОВЫЙ alias под PDF) PATCH /api/users/avatar — тот же аплоад, только под нужный путь/метод
r.patch(
  '/avatar',
  auth,
  upload.singleImage('avatar'), // поле формы: "avatar"
  ctrl.uploadAvatar
);

// список пользователей (admin)
r.get(
  '/',
  auth, admin,
  validate({
    query: {
      q:      { type: 'string', max: 255 },
      role:   { type: 'string', enum: ['user', 'admin'] },
      limit:  { type: 'number' },
      offset: { type: 'number' },
      // repo whitelist: rating|created_at|login|id (+/-), допускается несколько полей через запятую
      sort:   { type: 'string' },
    },
  }),
  ctrl.list
);

// назначить роль (admin)
r.patch(
  '/:id/role',
  auth, admin,
  validate({
    params: { id: { type: 'number', required: true } },
    body:   { role: { type: 'string', required: true, enum: ['user', 'admin'] } },
  }),
  ctrl.setRole
);

// публичный просмотр пользователя по id
r.get('/:id',
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.getById
);

// создание пользователя (admin-only)
r.post('/',
  auth, admin,
  validate({
    body: {
      login:     { type: 'string', min: 3, max: 32,  required: true },
      email:     { type: 'string', max: 254,         required: true },
      password:  { type: 'string', min: 6, max: 128, required: true },
      full_name: { type: 'string', max: 128 },
      role:      { type: 'string', enum: ['user', 'admin'] },
    },
  }),
  ctrl.createByAdmin
);

// удаление пользователя (admin-only)
r.delete('/:id',
  auth, admin,
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.remove
);

module.exports = r;
