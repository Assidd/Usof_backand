'use strict';

// GET /comments/post/:postId?limit=&offset=&sortBy=&order=&status=
const listCommentsSchema = {
  params: { postId: { type: 'number', required: true } },
  query: {
    limit:  { type: 'number' },
    offset: { type: 'number' },
    sortBy: { type: 'string', enum: ['publish_date', 'id'] },
    order:  { type: 'string', enum: ['ASC', 'DESC'] },
    status: { type: 'string', enum: ['active', 'inactive'] }, // сервис ограничит видимость
  }
};

// POST /comments
const createCommentSchema = {
  body: {
    postId:  { type: 'number', required: true },
    content: { type: 'string', required: true, min: 1, max: 5000 },
  }
};

// PATCH /comments/:id — по ТЗ менять можно ТОЛЬКО статус
const updateCommentSchema = {
  params: { id: { type: 'number', required: true } },
  body: {
    status:  { type: 'string', enum: ['active', 'inactive'], required: true },
  }
};

// DELETE /comments/:id
const deleteCommentSchema = {
  params: { id: { type: 'number', required: true } }
};

module.exports = {
  listCommentsSchema,
  createCommentSchema,
  updateCommentSchema,
  deleteCommentSchema,
};
