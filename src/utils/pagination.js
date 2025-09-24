function parsePagination({ page, limit }, max = Number(process.env.PAGINATION_LIMIT_MAX || 100)) {
  const p = Math.max(1, Number(page) || 1);
  const lDefault = Number(process.env.PAGINATION_LIMIT_DEFAULT || 10);
  const l = Math.min(max, Math.max(1, Number(limit) || lDefault));
  const offset = (p - 1) * l;
  return { page: p, limit: l, offset };
}

function buildMeta({ page, limit }, total) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, pages, total };
}

module.exports = { parsePagination, buildMeta };
