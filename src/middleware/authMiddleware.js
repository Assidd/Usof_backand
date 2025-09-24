// src/middleware/authMiddleware.js
'use strict';

const { verifyJwt, extractBearer } = require('../utils/jwt');
const tokensRepo = require('../repositories/tokensRepo');

function unauthorized(msg) {
  const err = new Error(msg);
  err.status = 401;
  err.name = 'UnauthorizedError';
  return err;
}

module.exports = async function authMiddleware(req, _res, next) {
  try {
    // 1) Bearer token
    const token = extractBearer(req);
    if (!token) throw unauthorized('Authorization token missing');

    // 2) Verify signature/claims (issuer, audience, exp — внутри verifyJwt)
    const payload = verifyJwt(token); // throws if invalid/expired

    // 3) Revocation check (blacklist by JTI)
    if (payload.jti) {
      const revoked = await tokensRepo.isRevoked(payload.jti);
      if (revoked) throw unauthorized('Token revoked');
    }

    // 4) Subject/role -> req.user
    if (!payload.sub) throw unauthorized('Invalid token subject');
    const id = Number(payload.sub);
    if (!Number.isFinite(id)) throw unauthorized('Invalid token subject');

    req.user = { id, role: payload.role || 'user' };

    // 5) Save token meta for logout route
    req.tokenMeta = {
      jti: payload.jti ?? null,
      exp: payload.exp ?? null,
      raw: token,
    };

    next();
  } catch (e) {
    if (!e.status) { e.status = 401; e.name = 'UnauthorizedError'; }
    next(e);
  }
};
