'use strict';

// GET /users
const listUsersSchema = {
  query: {
    page:   { type: 'number' },
    limit:  { type: 'number' },
    sortBy: { type: 'string', enum: ['created_at', 'rating', 'login'] },
    order:  { type: 'string', enum: ['ASC', 'DESC'] },
    q:      { type: 'string', max: 255 }, // поиск по логину/ФИО — разруливается в сервисе
  }
};

// GET /users/:id
const getUserSchema = {
  params: { id: { type: 'number', required: true } }
};

// PATCH /users/me
const updateMeSchema = {
  body: {
    full_name:      { type: 'string', min: 2,  max: 255 },
    password:       { type: 'string', min: 6,  max: 128 },
    // email менять можно отдельной ручкой с подтверждением — здесь не трогаем
  }
};

// PATCH /users/:id/role  (admin)
const changeRoleSchema = {
  params: { id: { type: 'number', required: true } },
  body:   { role: { type: 'string', required: true, enum: ['user', 'admin'] } }
};

module.exports = {
  listUsersSchema,
  getUserSchema,
  updateMeSchema,
  changeRoleSchema,
};
