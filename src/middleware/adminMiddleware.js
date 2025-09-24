// src/middleware/adminMiddleware.js
'use strict';

module.exports = function adminMiddleware(req, _res, next) {
  try {
    if (!req.user) {
      const err = new Error('Auth required');
      err.status = 401; err.name = 'UnauthorizedError';
      throw err;
    }
    if (req.user.role !== 'admin') {
      const err = new Error('Admin only');
      err.status = 403; err.name = 'ForbiddenError';
      throw err;
    }
    next();
  } catch (e) { next(e); }
};
