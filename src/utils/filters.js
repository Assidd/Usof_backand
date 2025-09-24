// Простой конструктор WHERE для фильтров постов
// allowed: { categoryId: 'pc.category_id', authorId: 'p.author_id', status: 'p.status', q: 'p.title' }
function buildWhere(filters, allowedMap) {
  const where = [];
  const params = [];

  for (const [key, column] of Object.entries(allowedMap)) {
    const val = filters?.[key];
    if (val === undefined || val === null || val === '') continue;

    if (key === 'q') { // простейший поиск по заголовку/контенту
      where.push(`${column} LIKE ?`);
      params.push(`%${String(val).trim()}%`);
    } else {
      where.push(`${column} = ?`);
      params.push(val);
    }
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

module.exports = { buildWhere };
