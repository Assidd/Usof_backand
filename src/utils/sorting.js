// whitelist: только разрешённые поля и направления
function parseSort({ sortBy, order }, allowed = ['date', 'likes', 'title', 'rating'], defaultSort = ['date', 'DESC']) {
  const field = allowed.includes(sortBy) ? sortBy : defaultSort[0];
  const dir = String(order || defaultSort[1]).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { field, dir };
}

module.exports = { parseSort };
