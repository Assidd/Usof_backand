// src/routes/commentRoutes.js
'use strict';

const { Router } = require('express');
const validate = require('../middleware/validate');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware'); // ← добавили
const ctrl = require('../controllers/commentController');

const r = Router();

const listQuery = {
  query: {
    limit:  { type: 'number' },
    offset: { type: 'number' },
    sort:   { type: 'string' }, // publish_date|id (+/-)
    status: { type: 'string', enum: ['active','inactive'] },
  },
};

// список комментариев по посту
r.get(
  '/post/:postId',
  validate({
    params: { postId: { type: 'number', required: true } },
    ...listQuery,
  }),
  ctrl.listByPost
);

// один комментарий
r.get(
  '/:id',
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.getById
);

// создать комментарий
r.post(
  '/',
  auth,
  validate({
    body: {
      post_id: { type: 'number', required: true },
      content: { type: 'string', required: true, min: 1, max: 5000 },
    },
  }),
  ctrl.create
);

// обновить комментарий (по ТЗ — только status)
r.patch(
  '/:id',
  auth,
  validate({
    params: { id: { type: 'number', required: true } },
    body: {
      status:  { type: 'string', enum: ['active','inactive'], required: true },
    },
  }),
  ctrl.update
);

// поставить/снять lock (admin only)
r.patch(
  '/:id/lock',
  auth, admin,
  validate({
    params: { id: { type: 'number', required: true } },
    body: { locked: { type: 'boolean', required: true } },
  }),
  ctrl.setLock
);

// удалить комментарий
r.delete(
  '/:id',
  auth,
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.remove
);

module.exports = r;
