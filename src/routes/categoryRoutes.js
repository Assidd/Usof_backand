// src/routes/categoryRoutes.js
'use strict';

const { Router } = require('express');
const validate = require('../middleware/validate');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const ctrl = require('../controllers/categoryController');

const r = Router();

// список категорий
r.get(
  '/',
  validate({
    query: {
      q:      { type: 'string', max: 255 },
      limit:  { type: 'number' },
      offset: { type: 'number' },
      sort:   { type: 'string' }, // id|title (+/-)
    },
  }),
  ctrl.list
);

// получить категорию по id (публично)
r.get(
  '/:id',
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.getById // <-- добавь реализацию в categoryController
);

// посты конкретной категории (публично)
r.get(
  '/:id/posts',
  validate({
    params: { id: { type: 'number', required: true } },
    query: {
      q:         { type: 'string', max: 255 },
      author_id: { type: 'number' },
      status:    { type: 'string', enum: ['active', 'inactive'] }, // для админа
      dateFrom:  { type: 'string' }, // YYYY-MM-DD или ISO
      dateTo:    { type: 'string' }, // YYYY-MM-DD или ISO
      limit:     { type: 'number' },
      offset:    { type: 'number' },
      sort:      { type: 'string' }, // likes|publish_date|title|id (+/-)
    },
  }),
  ctrl.getPosts
);

// создать категорию (admin)
r.post(
  '/',
  auth, admin,
  validate({
    body: {
      title:       { type: 'string', required: true, min: 2, max: 128 },
      description: { type: 'string', required: false, max: 255 },
    },
  }),
  ctrl.create
);

// обновить категорию (admin)
r.patch(
  '/:id',
  auth, admin,
  validate({
    params: { id: { type: 'number', required: true } },
    body: {
      title:       { type: 'string', min: 2, max: 128 },
      description: { type: 'string', max: 255 },
    },
  }),
  ctrl.update
);

// удалить категорию (admin)
r.delete(
  '/:id',
  auth, admin,
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.remove
);

module.exports = r;
