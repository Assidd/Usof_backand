'use strict';

// GET /categories
const listCategoriesSchema = {
  query: {
    page:   { type: 'number' },
    limit:  { type: 'number' },
    sortBy: { type: 'string', enum: ['id', 'title'] },
    order:  { type: 'string', enum: ['ASC', 'DESC'] },
    q:      { type: 'string', max: 255 }, // поиск по названию
  }
};

// POST /categories  (admin)
const createCategorySchema = {
  body: {
    title:       { type: 'string', required: true, min: 2, max: 128 },
    description: { type: 'string', max: 2000 },
  }
};

// PATCH /categories/:id  (admin)
const updateCategorySchema = {
  params: { id: { type: 'number', required: true } },
  body: {
    title:       { type: 'string', min: 2, max: 128 },
    description: { type: 'string', max: 2000 },
  }
};

// DELETE /categories/:id  (admin)
const deleteCategorySchema = {
  params: { id: { type: 'number', required: true } }
};

module.exports = {
  listCategoriesSchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
};
