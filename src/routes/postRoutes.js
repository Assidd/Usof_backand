// src/routes/postRoutes.js 
'use strict';

const { Router } = require('express');
const validate = require('../middleware/validate');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware'); // ← добавили
const upload = require('../middleware/upload');
const ctrl = require('../controllers/postController');
const commentsCtrl = require('../controllers/commentController'); // ← для nested comments

const r = Router();

// листинг
r.get('/',
  validate({
    query: {
      q:         { type: 'string', max: 255 },
      author_id: { type: 'number' },
      category:  { type: 'number' },
      status:    { type: 'string', enum: ['active','inactive'] },
      dateFrom:  { type: 'string' },
      dateTo:    { type: 'string' },
      limit:     { type: 'number' },
      offset:    { type: 'number' },
      sort:      { type: 'string' }, // b/c: likes|publish_date|title|id (+/-)
      // новая схема сортировки по PDF
      sortBy:    { type: 'string', enum: ['likes','rating','publish_date','title','id'] },
      order:     { type: 'string', enum: ['asc','desc','ASC','DESC'] },
    },
  }),
  ctrl.list
);

// NESTED: GET /api/posts/:id/comments — список комментов под постом (публично)
r.get(
  '/:id/comments',
  validate({
    params: { id: { type: 'number', required: true } },
    query: {
      page:   { type: 'number' },
      limit:  { type: 'number' },
      offset: { type: 'number' },
      sortBy: { type: 'string', enum: ['publish_date', 'id'] },
      order:  { type: 'string', enum: ['asc', 'desc', 'ASC', 'DESC'] },
      status: { type: 'string', enum: ['active', 'inactive'] }, // inactive видит только админ
    },
  }),
  commentsCtrl.listForPost
);

// NESTED: POST /api/posts/:id/comments — создать коммент (нужна авторизация)
r.post(
  '/:id/comments',
  auth,
  validate({
    params: { id: { type: 'number', required: true } },
    body:   { content: { type: 'string', required: true, min: 1, max: 5000 } },
  }),
  commentsCtrl.createForPost
);

// сначала категории поста, потом сам пост
r.get('/:id/categories',
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.getCategories
);

r.get('/:id',
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.findById
);

// создать пост (categories — array; CSV допустим через allowCsv)
r.post('/',
  auth,
  validate({
    body: {
      title:    { type: 'string', required: true, min: 3, max: 255 },
      content:  { type: 'string', required: true, min: 1, max: 50000 },
      status:   { type: 'string', enum: ['active','inactive'] },
      image:    { type: 'string' },
      categories: { type: 'array', allowCsv: true, items: 'number', minItems: 0, maxItems: 20 },
    },
  }),
  ctrl.create
);

// обновить пост
r.patch('/:id',
  auth,
  validate({
    params: { id: { type: 'number', required: true } },
    body: {
      title:    { type: 'string', min: 3, max: 255 },
      content:  { type: 'string', min: 1, max: 50000 },
      status:   { type: 'string', enum: ['active','inactive'] },
      image:    { type: 'string' },
      categories: { type: 'array', allowCsv: true, items: 'number', minItems: 0, maxItems: 20 },
    },
  }),
  ctrl.update
);

// поставить/снять lock (admin only)
r.patch('/:id/lock',
  auth, admin,
  validate({
    params: { id: { type: 'number', required: true } },
    body:   { locked: { type: 'boolean', required: true } },
  }),
  ctrl.setLock
);

// загрузка картинки поста (multipart/form-data, поле "image")
r.post('/:id/image',
  auth,
  validate({ params: { id: { type: 'number', required: true } } }),
  upload.singleImage('image'),
  ctrl.uploadImage
);

// удалить
r.delete('/:id',
  auth,
  validate({ params: { id: { type: 'number', required: true } } }),
  ctrl.remove
);

module.exports = r;
