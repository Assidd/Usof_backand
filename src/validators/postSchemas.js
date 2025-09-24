'use strict';

// GET /posts
// Поддерживаем и page (на будущее), и offset (как в контроллере).
const listPostsSchema = {
  query: {
    page:       { type: 'number' }, // необязательно
    offset:     { type: 'number' }, // ✅ используется контроллером
    limit:      { type: 'number' },
    sortBy:     { type: 'string', enum: ['publish_date', 'title', 'rating', 'likes'] },
    order:      { type: 'string', enum: ['ASC', 'DESC'] },
    categoryId: { type: 'number' }, // алиас ?category поддерживается в контроллере
    authorId:   { type: 'number' },
    status:     { type: 'string', enum: ['active', 'inactive'] }, // сервис сам ограничит для обычных юзеров
    q:          { type: 'string', max: 255 }, // поиск по заголовку/контенту
  }
};

// GET /posts/:id
const getPostSchema = {
  params: { id: { type: 'number', required: true } }
};

// POST /posts
// Единое поле: categories (array), поддержка CSV через allowCsv
const createPostSchema = {
  body: {
    title:      { type: 'string', required: true, min: 3, max: 255 },
    content:    { type: 'string', required: true, min: 1 },
    status:     { type: 'string', enum: ['active', 'inactive'] },
    categories: { type: 'array', items: { type: 'number' }, required: false, allowCsv: true },
    // image грузится через multer — тут не валидируем
  }
};

// PATCH /posts/:id
// ⚠️ Ролевые ограничения (админ не владелец → только status и categories)
//     реализованы в сервисе, здесь валидируем форму данных.
const updatePostSchema = {
  params: { id: { type: 'number', required: true } },
  body: {
    title:      { type: 'string', min: 3, max: 255 },
    content:    { type: 'string', min: 1 },
    status:     { type: 'string', enum: ['active', 'inactive'] },
    categories: { type: 'array', items: { type: 'number' }, required: false, allowCsv: true }
  }
};

// DELETE /posts/:id
const deletePostSchema = {
  params: { id: { type: 'number', required: true } }
};

module.exports = {
  listPostsSchema,
  getPostSchema,
  createPostSchema,
  updatePostSchema,
  deletePostSchema,
};
